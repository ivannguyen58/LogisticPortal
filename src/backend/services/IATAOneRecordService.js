const axios = require('axios');
const config = require('../config/config');

/**
 * IATA OneRecord Integration Service
 * Handles communication with IATA OneRecord compliant systems
 */
class IATAOneRecordService {
  constructor() {
    this.baseUrl = config.externalApis.iataOneRecord.baseUrl;
    this.apiKey = config.externalApis.iataOneRecord.apiKey;
    this.timeout = config.externalApis.iataOneRecord.timeout;
    this.enabled = config.externalApis.iataOneRecord.enabled;

    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/ld+json',
        'Accept': 'application/ld+json',
        'User-Agent': 'ALSC-Portal/1.0'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('IATA OneRecord API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message
        });
        throw this.transformError(error);
      }
    );
  }

  /**
   * Get tracking data for a shipment by AWB
   */
  async getTrackingData(awbNumber) {
    if (!this.enabled) {
      console.warn('IATA OneRecord integration is disabled');
      return [];
    }

    try {
      console.log(`Fetching IATA OneRecord data for AWB: ${awbNumber}`);

      // Format AWB for OneRecord (remove dash)
      const formattedAwb = awbNumber.replace('-', '');
      
      // Get shipment logistics object
      const shipmentUrl = `/logistics-objects/shipments/${formattedAwb}`;
      const response = await this.client.get(shipmentUrl);

      const shipmentData = response.data;
      
      // Extract tracking events from the shipment data
      const trackingEvents = this.extractTrackingEvents(shipmentData);
      
      console.log(`Retrieved ${trackingEvents.length} tracking events from IATA OneRecord`);
      return trackingEvents;
    } catch (error) {
      console.error(`Failed to get IATA OneRecord data for ${awbNumber}:`, error.message);
      
      // Return empty array instead of throwing to allow other sources to work
      return [];
    }
  }

  /**
   * Extract tracking events from IATA OneRecord shipment data
   */
  extractTrackingEvents(shipmentData) {
    const events = [];

    try {
      // Handle different OneRecord data structures
      const logisticsEvents = shipmentData.events || 
                             shipmentData.logisticsEvents || 
                             shipmentData['@graph']?.filter(item => item['@type'] === 'LogisticsEvent') || 
                             [];

      for (const event of logisticsEvents) {
        const trackingEvent = this.mapOneRecordEventToTracking(event);
        if (trackingEvent) {
          events.push(trackingEvent);
        }
      }

      // Extract events from pieces if available
      if (shipmentData.pieces || shipmentData.containedPieces) {
        const pieces = shipmentData.pieces || shipmentData.containedPieces;
        
        for (const piece of pieces) {
          if (piece.events || piece.logisticsEvents) {
            const pieceEvents = piece.events || piece.logisticsEvents;
            
            for (const event of pieceEvents) {
              const trackingEvent = this.mapOneRecordEventToTracking(event, piece);
              if (trackingEvent) {
                events.push(trackingEvent);
              }
            }
          }
        }
      }

      // Sort events by date/time
      events.sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime));
      
    } catch (error) {
      console.error('Error extracting tracking events from OneRecord data:', error);
    }

    return events;
  }

  /**
   * Map IATA OneRecord event to internal tracking event format
   */
  mapOneRecordEventToTracking(oneRecordEvent, piece = null) {
    try {
      // Extract basic event information
      const eventType = oneRecordEvent.eventType || oneRecordEvent['@type'];
      const eventCode = this.mapEventTypeToCode(eventType);
      
      if (!eventCode) {
        console.warn('Unknown OneRecord event type:', eventType);
        return null;
      }

      // Extract location information
      const location = this.extractLocation(oneRecordEvent);
      
      // Extract date/time
      const dateTime = this.extractDateTime(oneRecordEvent);
      
      if (!dateTime) {
        console.warn('No valid date/time found for OneRecord event');
        return null;
      }

      // Build tracking event
      const trackingEvent = {
        event_code: eventCode,
        event_description: this.generateEventDescription(oneRecordEvent, eventCode),
        event_category: this.mapEventCategory(eventCode),
        event_location: location.name,
        event_country: location.country,
        event_city: location.city,
        airport_code: location.airportCode,
        event_datetime: dateTime,
        event_timezone: this.extractTimezone(oneRecordEvent),
        is_milestone: this.isMilestoneEvent(eventCode),
        is_exception: this.isExceptionEvent(oneRecordEvent),
        severity_level: this.determineSeverityLevel(oneRecordEvent),
        external_event_id: oneRecordEvent.id || oneRecordEvent['@id'],
        source_reference: oneRecordEvent.reference || oneRecordEvent.eventReference,
        longitude: location.longitude,
        latitude: location.latitude,
        additional_info: this.extractAdditionalInfo(oneRecordEvent, piece)
      };

      return trackingEvent;
    } catch (error) {
      console.error('Error mapping OneRecord event:', error);
      return null;
    }
  }

  /**
   * Map OneRecord event type to internal event code
   */
  mapEventTypeToCode(eventType) {
    const eventMapping = {
      // Standard IATA OneRecord event types
      'Acceptance': 'CARGO_COLLECTED',
      'Departure': 'FLIGHT_DEPARTED',
      'Arrival': 'FLIGHT_ARRIVED',
      'Delivery': 'DELIVERED',
      'CustomsDeclaration': 'CUSTOMS_CLEARANCE',
      'CustomsRelease': 'CUSTOMS_CLEARED',
      'Loading': 'MANIFESTED',
      'Unloading': 'ARRIVED',
      'Transfer': 'IN_TRANSIT',
      'Storage': 'ARRIVED_WAREHOUSE',
      'Discrepancy': 'EXCEPTION',
      'Damage': 'EXCEPTION',
      'Delay': 'EXCEPTION',
      
      // Extended event types
      'Pickup': 'PICKUP_SCHEDULED',
      'Collection': 'CARGO_COLLECTED',
      'Screening': 'SECURITY_SCREENING',
      'WeighingAndMeasuring': 'CARGO_PROCESSED',
      'Consolidation': 'CONSOLIDATED',
      'Deconsolidation': 'DECONSOLIDATED',
      'DocumentaryCompliance': 'DOCUMENTS_VERIFIED',
      'RegulatoryCompliance': 'COMPLIANCE_CHECK',
      
      // Fallback mapping
      'LogisticsEvent': 'STATUS_UPDATE'
    };

    return eventMapping[eventType] || null;
  }

  /**
   * Extract location information from OneRecord event
   */
  extractLocation(event) {
    const location = {
      name: null,
      country: null,
      city: null,
      airportCode: null,
      longitude: null,
      latitude: null
    };

    try {
      // Try different location field names
      const locationData = event.location || 
                          event.eventLocation || 
                          event.place || 
                          event.facility;

      if (locationData) {
        location.name = locationData.name || locationData.locationName;
        location.country = locationData.country || locationData.countryCode;
        location.city = locationData.city || locationData.cityName;
        location.airportCode = locationData.iataCode || locationData.icaoCode;
        
        // Extract coordinates
        if (locationData.coordinates || locationData.geolocation) {
          const coords = locationData.coordinates || locationData.geolocation;
          location.longitude = coords.longitude || coords.lng;
          location.latitude = coords.latitude || coords.lat;
        }
      }

      // Try to extract airport code from other fields
      if (!location.airportCode && event.airport) {
        location.airportCode = event.airport.iataCode || event.airport.icaoCode;
      }

    } catch (error) {
      console.warn('Error extracting location from OneRecord event:', error);
    }

    return location;
  }

  /**
   * Extract date/time from OneRecord event
   */
  extractDateTime(event) {
    try {
      // Try different datetime field names
      const dateTimeFields = [
        'eventDateTime',
        'timestamp',
        'dateTime',
        'occurredAt',
        'recordedAt',
        'createdAt'
      ];

      for (const field of dateTimeFields) {
        if (event[field]) {
          const date = new Date(event[field]);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }

      // Try nested datetime
      if (event.timing && event.timing.actual) {
        const date = new Date(event.timing.actual);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

      return null;
    } catch (error) {
      console.warn('Error extracting datetime from OneRecord event:', error);
      return null;
    }
  }

  /**
   * Extract timezone from OneRecord event
   */
  extractTimezone(event) {
    try {
      if (event.timezone) return event.timezone;
      if (event.eventDateTime && typeof event.eventDateTime === 'string') {
        // Try to extract timezone from ISO string
        const match = event.eventDateTime.match(/([+-]\d{2}:?\d{2}|Z)$/);
        if (match) {
          return match[1] === 'Z' ? 'UTC' : match[1];
        }
      }
      return 'UTC';
    } catch (error) {
      return 'UTC';
    }
  }

  /**
   * Generate event description
   */
  generateEventDescription(event, eventCode) {
    // Use provided description first
    if (event.description || event.eventDescription) {
      return event.description || event.eventDescription;
    }

    // Generate description based on event code
    const descriptions = {
      'CARGO_COLLECTED': 'Cargo collected from shipper',
      'FLIGHT_DEPARTED': 'Flight departed from origin airport',
      'FLIGHT_ARRIVED': 'Flight arrived at destination airport',
      'DELIVERED': 'Shipment delivered to consignee',
      'CUSTOMS_CLEARANCE': 'Shipment in customs clearance',
      'CUSTOMS_CLEARED': 'Shipment cleared customs',
      'MANIFESTED': 'Shipment manifested on flight',
      'ARRIVED': 'Shipment arrived at facility',
      'IN_TRANSIT': 'Shipment in transit',
      'EXCEPTION': 'Exception occurred during processing'
    };

    return descriptions[eventCode] || 'Shipment status updated';
  }

  /**
   * Map event category
   */
  mapEventCategory(eventCode) {
    const categoryMapping = {
      'CARGO_COLLECTED': 'PICKUP',
      'PICKUP_SCHEDULED': 'PICKUP',
      'FLIGHT_DEPARTED': 'DEPARTURE',
      'MANIFESTED': 'DEPARTURE',
      'IN_TRANSIT': 'TRANSIT',
      'FLIGHT_ARRIVED': 'ARRIVAL',
      'ARRIVED': 'ARRIVAL',
      'CUSTOMS_CLEARANCE': 'CUSTOMS',
      'CUSTOMS_CLEARED': 'CUSTOMS',
      'DELIVERED': 'DELIVERY',
      'EXCEPTION': 'EXCEPTION'
    };

    return categoryMapping[eventCode] || 'STATUS_UPDATE';
  }

  /**
   * Check if event is a milestone
   */
  isMilestoneEvent(eventCode) {
    const milestoneEvents = [
      'CARGO_COLLECTED',
      'MANIFESTED',
      'FLIGHT_DEPARTED',
      'FLIGHT_ARRIVED',
      'CUSTOMS_CLEARED',
      'DELIVERED'
    ];

    return milestoneEvents.includes(eventCode) ? 1 : 0;
  }

  /**
   * Check if event is an exception
   */
  isExceptionEvent(event) {
    try {
      // Check event type
      if (event.eventType === 'Discrepancy' || 
          event.eventType === 'Damage' || 
          event.eventType === 'Delay') {
        return 1;
      }

      // Check for exception indicators
      if (event.isException || event.exception || event.problem) {
        return 1;
      }

      // Check status
      if (event.status === 'EXCEPTION' || event.status === 'ERROR') {
        return 1;
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Determine severity level
   */
  determineSeverityLevel(event) {
    try {
      if (event.severity) {
        return event.severity.toUpperCase();
      }

      if (this.isExceptionEvent(event)) {
        return 'WARNING';
      }

      if (event.critical || event.urgent) {
        return 'CRITICAL';
      }

      return 'INFO';
    } catch (error) {
      return 'INFO';
    }
  }

  /**
   * Extract additional information
   */
  extractAdditionalInfo(event, piece = null) {
    try {
      const additionalInfo = {};

      // Add piece information if available
      if (piece) {
        additionalInfo.piece = {
          id: piece.id || piece['@id'],
          weight: piece.weight,
          dimensions: piece.dimensions,
          slac: piece.slac
        };
      }

      // Add event specific data
      if (event.details) {
        additionalInfo.details = event.details;
      }

      if (event.measurements) {
        additionalInfo.measurements = event.measurements;
      }

      if (event.documents) {
        additionalInfo.documents = event.documents;
      }

      if (event.parties) {
        additionalInfo.parties = event.parties;
      }

      // Add any custom fields
      const customFields = ['reference', 'airlineCode', 'flightNumber', 'serviceType'];
      for (const field of customFields) {
        if (event[field]) {
          additionalInfo[field] = event[field];
        }
      }

      return Object.keys(additionalInfo).length > 0 ? additionalInfo : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Transform API error to consistent format
   */
  transformError(error) {
    const transformedError = new Error();
    
    if (error.response) {
      // Server responded with error status
      transformedError.message = `IATA OneRecord API Error: ${error.response.status} - ${error.response.data?.message || error.message}`;
      transformedError.status = error.response.status;
      transformedError.data = error.response.data;
    } else if (error.request) {
      // Request was made but no response received
      transformedError.message = 'IATA OneRecord API: No response received';
      transformedError.status = 0;
    } else {
      // Request setup error
      transformedError.message = `IATA OneRecord API: ${error.message}`;
    }

    transformedError.originalError = error;
    return transformedError;
  }

  /**
   * Create a new shipment in OneRecord (if supported)
   */
  async createShipment(shipmentData) {
    if (!this.enabled) {
      throw new Error('IATA OneRecord integration is disabled');
    }

    try {
      const oneRecordShipment = this.mapToOneRecordShipment(shipmentData);
      
      const response = await this.client.post('/logistics-objects/shipments', oneRecordShipment);
      
      return {
        success: true,
        oneRecordId: response.data.id || response.data['@id'],
        data: response.data
      };
    } catch (error) {
      console.error('Failed to create OneRecord shipment:', error.message);
      throw error;
    }
  }

  /**
   * Update shipment in OneRecord (if supported)
   */
  async updateShipment(awbNumber, updateData) {
    if (!this.enabled) {
      throw new Error('IATA OneRecord integration is disabled');
    }

    try {
      const formattedAwb = awbNumber.replace('-', '');
      const url = `/logistics-objects/shipments/${formattedAwb}`;
      
      const response = await this.client.patch(url, updateData);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Failed to update OneRecord shipment:', error.message);
      throw error;
    }
  }

  /**
   * Map internal shipment data to OneRecord format
   */
  mapToOneRecordShipment(shipmentData) {
    return {
      '@context': 'https://onerecord.iata.org/ontology/cargo',
      '@type': 'Shipment',
      'waybillNumber': shipmentData.awb_number.replace('-', ''),
      'origin': {
        '@type': 'Location',
        'iataCode': shipmentData.origin_airport
      },
      'destination': {
        '@type': 'Location',
        'iataCode': shipmentData.destination_airport
      },
      'pieces': [{
        '@type': 'Piece',
        'grossWeight': {
          '@type': 'Value',
          'value': shipmentData.weight_kg,
          'unit': 'KGM'
        },
        'dimensions': shipmentData.volume_cbm ? {
          '@type': 'Dimensions',
          'volume': {
            '@type': 'Value',
            'value': shipmentData.volume_cbm,
            'unit': 'MTQ'
          }
        } : null
      }],
      'goodsDescription': shipmentData.commodity_description,
      'declaredValue': shipmentData.declared_value ? {
        '@type': 'CurrencyValue',
        'value': shipmentData.declared_value,
        'currency': shipmentData.currency
      } : null
    };
  }

  /**
   * Get service health
   */
  async healthCheck() {
    if (!this.enabled) {
      return { status: 'disabled', message: 'IATA OneRecord integration is disabled' };
    }

    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return { 
        status: 'healthy', 
        responseTime: response.duration,
        version: response.data?.version 
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }
}

module.exports = IATAOneRecordService;