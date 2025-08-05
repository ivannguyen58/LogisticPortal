const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * TrackingEvent Model
 * Handles all tracking event-related database operations
 */
class TrackingEvent {
  constructor(data = {}) {
    this.event_id = data.event_id || uuidv4();
    this.shipment_id = data.shipment_id;
    
    // Event details
    this.event_code = data.event_code;
    this.event_description = data.event_description;
    this.event_category = data.event_category || 'STATUS_UPDATE';
    
    // Location and timing
    this.event_location = data.event_location;
    this.event_country = data.event_country;
    this.event_city = data.event_city;
    this.airport_code = data.airport_code;
    this.event_datetime = data.event_datetime;
    this.event_timezone = data.event_timezone || 'UTC';
    
    // Event classification
    this.milestone_id = data.milestone_id;
    this.is_milestone = data.is_milestone || 0;
    this.is_exception = data.is_exception || 0;
    this.is_critical = data.is_critical || 0;
    this.severity_level = data.severity_level || 'INFO';
    
    // Data source
    this.source_id = data.source_id;
    this.external_event_id = data.external_event_id;
    this.source_reference = data.source_reference;
    
    // Additional data
    this.additional_info = data.additional_info;
    this.longitude = data.longitude;
    this.latitude = data.latitude;
    this.temperature_celsius = data.temperature_celsius;
    this.humidity_percent = data.humidity_percent;
    
    // Processing status
    this.processed = data.processed || 0;
    this.notification_sent = data.notification_sent || 0;
    this.customer_visible = data.customer_visible !== undefined ? data.customer_visible : 1;
    
    // Audit fields
    this.created_at = data.created_at;
    this.created_by = data.created_by;
    
    // Related data (from joins)
    this.milestone_name = data.milestone_name;
    this.milestone_category = data.milestone_category;
    this.source_name = data.source_name;
  }

  /**
   * Create a new tracking event
   */
  async create() {
    try {
      const query = `
        INSERT INTO tracking_events (
          event_id, shipment_id, event_code, event_description, event_category,
          event_location, event_country, event_city, airport_code, 
          event_datetime, event_timezone, milestone_id, is_milestone, 
          is_exception, is_critical, severity_level, source_id, 
          external_event_id, source_reference, additional_info,
          longitude, latitude, temperature_celsius, humidity_percent,
          processed, notification_sent, customer_visible, created_by
        ) VALUES (
          :event_id, :shipment_id, :event_code, :event_description, :event_category,
          :event_location, :event_country, :event_city, :airport_code,
          :event_datetime, :event_timezone, :milestone_id, :is_milestone,
          :is_exception, :is_critical, :severity_level, :source_id,
          :external_event_id, :source_reference, :additional_info,
          :longitude, :latitude, :temperature_celsius, :humidity_percent,
          :processed, :notification_sent, :customer_visible, :created_by
        )
      `;

      await db.execute(query, this);
      await db.commit();
      
      // Update shipment's last tracked time and current location
      await this.updateShipmentStatus();
      
      return this;
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to create tracking event: ${error.message}`);
    }
  }

  /**
   * Find tracking event by ID
   */
  static async findById(eventId) {
    try {
      const query = `
        SELECT te.*, sm.milestone_name, sm.milestone_category, ts.source_name
        FROM tracking_events te
        LEFT JOIN shipment_milestones sm ON te.milestone_id = sm.milestone_id
        LEFT JOIN tracking_sources ts ON te.source_id = ts.source_id
        WHERE te.event_id = :eventId
      `;
      
      const result = await db.execute(query, { eventId });
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new TrackingEvent(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to find tracking event: ${error.message}`);
    }
  }

  /**
   * Find tracking events by shipment ID
   */
  static async findByShipment(shipmentId, options = {}) {
    try {
      const {
        limit = 100,
        offset = 0,
        includeInternal = false,
        eventCategory = null,
        milestonesOnly = false,
        exceptionsOnly = false,
        orderBy = 'event_datetime',
        orderDirection = 'DESC'
      } = options;

      let whereConditions = ['te.shipment_id = :shipmentId'];
      const queryParams = { shipmentId };

      if (!includeInternal) {
        whereConditions.push('te.customer_visible = 1');
      }

      if (eventCategory) {
        whereConditions.push('te.event_category = :eventCategory');
        queryParams.eventCategory = eventCategory;
      }

      if (milestonesOnly) {
        whereConditions.push('te.is_milestone = 1');
      }

      if (exceptionsOnly) {
        whereConditions.push('te.is_exception = 1');
      }

      const query = `
        SELECT te.*, sm.milestone_name, sm.milestone_category, ts.source_name,
               COUNT(*) OVER() as total_count
        FROM tracking_events te
        LEFT JOIN shipment_milestones sm ON te.milestone_id = sm.milestone_id
        LEFT JOIN tracking_sources ts ON te.source_id = ts.source_id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY te.${orderBy} ${orderDirection}
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      queryParams.limit = limit;
      queryParams.offset = offset;

      const result = await db.execute(query, queryParams);
      
      return {
        events: result.rows.map(row => new TrackingEvent(row)),
        totalCount: result.rows.length > 0 ? result.rows[0].total_count : 0
      };
    } catch (error) {
      throw new Error(`Failed to find tracking events: ${error.message}`);
    }
  }

  /**
   * Find latest tracking event for a shipment
   */
  static async findLatestByShipment(shipmentId) {
    try {
      const result = await this.findByShipment(shipmentId, { limit: 1 });
      return result.events.length > 0 ? result.events[0] : null;
    } catch (error) {
      throw new Error(`Failed to find latest tracking event: ${error.message}`);
    }
  }

  /**
   * Find tracking events by external event ID
   */
  static async findByExternalId(externalEventId, sourceId = null) {
    try {
      let whereConditions = ['te.external_event_id = :externalEventId'];
      const queryParams = { externalEventId };

      if (sourceId) {
        whereConditions.push('te.source_id = :sourceId');
        queryParams.sourceId = sourceId;
      }

      const query = `
        SELECT te.*, sm.milestone_name, sm.milestone_category, ts.source_name
        FROM tracking_events te
        LEFT JOIN shipment_milestones sm ON te.milestone_id = sm.milestone_id
        LEFT JOIN tracking_sources ts ON te.source_id = ts.source_id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY te.event_datetime DESC
      `;

      const result = await db.execute(query, queryParams);
      return result.rows.map(row => new TrackingEvent(row));
    } catch (error) {
      throw new Error(`Failed to find tracking events by external ID: ${error.message}`);
    }
  }

  /**
   * Find unprocessed tracking events
   */
  static async findUnprocessed(limit = 100) {
    try {
      const query = `
        SELECT te.*, sm.milestone_name, sm.milestone_category, ts.source_name
        FROM tracking_events te
        LEFT JOIN shipment_milestones sm ON te.milestone_id = sm.milestone_id
        LEFT JOIN tracking_sources ts ON te.source_id = ts.source_id
        WHERE te.processed = 0
        ORDER BY te.created_at ASC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await db.execute(query, { limit });
      return result.rows.map(row => new TrackingEvent(row));
    } catch (error) {
      throw new Error(`Failed to find unprocessed events: ${error.message}`);
    }
  }

  /**
   * Mark event as processed
   */
  async markAsProcessed() {
    try {
      const query = `
        UPDATE tracking_events 
        SET processed = 1
        WHERE event_id = :event_id
      `;

      await db.execute(query, { event_id: this.event_id });
      await db.commit();
      
      this.processed = 1;
      return this;
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to mark event as processed: ${error.message}`);
    }
  }

  /**
   * Mark notification as sent
   */
  async markNotificationSent() {
    try {
      const query = `
        UPDATE tracking_events 
        SET notification_sent = 1
        WHERE event_id = :event_id
      `;

      await db.execute(query, { event_id: this.event_id });
      await db.commit();
      
      this.notification_sent = 1;
      return this;
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to mark notification as sent: ${error.message}`);
    }
  }

  /**
   * Update shipment status based on this tracking event
   */
  async updateShipmentStatus() {
    try {
      // Only update if this is a milestone or status update
      if (this.is_milestone || this.event_category === 'STATUS_UPDATE') {
        const statusMapping = {
          'SHIPMENT_CREATED': 'CREATED',
          'CARGO_COLLECTED': 'BOOKED',
          'MANIFESTED': 'MANIFESTED',
          'FLIGHT_DEPARTED': 'DEPARTED',
          'IN_TRANSIT': 'IN_TRANSIT',
          'FLIGHT_ARRIVED': 'ARRIVED',
          'CUSTOMS_CLEARANCE': 'CUSTOMS_CLEARANCE',
          'CUSTOMS_CLEARED': 'CUSTOMS_CLEARANCE',
          'OUT_FOR_DELIVERY': 'OUT_FOR_DELIVERY',
          'DELIVERED': 'DELIVERED'
        };

        const newStatus = statusMapping[this.event_code] || this.current_status;

        const query = `
          UPDATE shipments 
          SET current_status = :newStatus,
              current_location = :event_location,
              last_tracked_at = :event_datetime
          WHERE shipment_id = :shipment_id
        `;

        await db.execute(query, {
          newStatus,
          event_location: this.event_location,
          event_datetime: this.event_datetime,
          shipment_id: this.shipment_id
        });

        // Update delivery date if delivered
        if (this.event_code === 'DELIVERED') {
          const deliveryQuery = `
            UPDATE shipments 
            SET delivery_date = :event_datetime
            WHERE shipment_id = :shipment_id
          `;

          await db.execute(deliveryQuery, {
            event_datetime: this.event_datetime,
            shipment_id: this.shipment_id
          });
        }

        await db.commit();
      }
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to update shipment status: ${error.message}`);
    }
  }

  /**
   * Get milestone information
   */
  async getMilestone() {
    if (!this.milestone_id) {
      return null;
    }

    try {
      const query = `
        SELECT * FROM shipment_milestones 
        WHERE milestone_id = :milestone_id
      `;

      const result = await db.execute(query, { milestone_id: this.milestone_id });
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      throw new Error(`Failed to get milestone: ${error.message}`);
    }
  }

  /**
   * Get tracking source information
   */
  async getSource() {
    if (!this.source_id) {
      return null;
    }

    try {
      const query = `
        SELECT * FROM tracking_sources 
        WHERE source_id = :source_id
      `;

      const result = await db.execute(query, { source_id: this.source_id });
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      throw new Error(`Failed to get tracking source: ${error.message}`);
    }
  }

  /**
   * Check if event already exists (prevent duplicates)
   */
  static async checkDuplicate(shipmentId, eventCode, eventDatetime, externalEventId = null) {
    try {
      let whereConditions = [
        'shipment_id = :shipmentId',
        'event_code = :eventCode',
        'ABS(EXTRACT(EPOCH FROM (event_datetime - :eventDatetime))) < 300' // Within 5 minutes
      ];
      
      const queryParams = { shipmentId, eventCode, eventDatetime };

      if (externalEventId) {
        whereConditions.push('external_event_id = :externalEventId');
        queryParams.externalEventId = externalEventId;
      }

      const query = `
        SELECT COUNT(*) as count
        FROM tracking_events
        WHERE ${whereConditions.join(' AND ')}
      `;

      const result = await db.execute(query, queryParams);
      return result.rows[0].count > 0;
    } catch (error) {
      throw new Error(`Failed to check duplicate event: ${error.message}`);
    }
  }

  /**
   * Create tracking event from external data
   */
  static async createFromExternal(externalData, sourceId, shipmentId) {
    try {
      // Check for duplicates first
      const isDuplicate = await this.checkDuplicate(
        shipmentId,
        externalData.event_code,
        externalData.event_datetime,
        externalData.external_event_id
      );

      if (isDuplicate) {
        throw new Error('Duplicate tracking event detected');
      }

      const event = new TrackingEvent({
        shipment_id: shipmentId,
        event_code: externalData.event_code,
        event_description: externalData.event_description,
        event_category: externalData.event_category || 'STATUS_UPDATE',
        event_location: externalData.event_location,
        event_country: externalData.event_country,
        event_city: externalData.event_city,
        airport_code: externalData.airport_code,
        event_datetime: externalData.event_datetime,
        event_timezone: externalData.event_timezone || 'UTC',
        source_id: sourceId,
        external_event_id: externalData.external_event_id,
        source_reference: externalData.source_reference,
        additional_info: externalData.additional_info ? JSON.stringify(externalData.additional_info) : null,
        longitude: externalData.longitude,
        latitude: externalData.latitude,
        temperature_celsius: externalData.temperature_celsius,
        humidity_percent: externalData.humidity_percent,
        is_milestone: externalData.is_milestone || 0,
        is_exception: externalData.is_exception || 0,
        severity_level: externalData.severity_level || 'INFO',
        customer_visible: externalData.customer_visible !== undefined ? externalData.customer_visible : 1
      });

      await event.create();
      return event;
    } catch (error) {
      throw new Error(`Failed to create event from external data: ${error.message}`);
    }
  }

  /**
   * Get events requiring notifications
   */
  static async findEventsForNotification() {
    try {
      const query = `
        SELECT te.*, s.customer_id, s.awb_number
        FROM tracking_events te
        JOIN shipments s ON te.shipment_id = s.shipment_id
        WHERE te.notification_sent = 0
        AND te.customer_visible = 1
        AND (te.is_milestone = 1 OR te.is_exception = 1 OR te.is_critical = 1)
        ORDER BY te.created_at ASC
        FETCH FIRST 100 ROWS ONLY
      `;

      const result = await db.execute(query);
      return result.rows.map(row => ({
        event: new TrackingEvent(row),
        customer_id: row.customer_id,
        awb_number: row.awb_number
      }));
    } catch (error) {
      throw new Error(`Failed to find events for notification: ${error.message}`);
    }
  }

  /**
   * Get tracking statistics for dashboard
   */
  static async getTrackingStatistics(dateFrom, dateTo) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN is_milestone = 1 THEN 1 END) as milestone_events,
          COUNT(CASE WHEN is_exception = 1 THEN 1 END) as exception_events,
          COUNT(CASE WHEN severity_level = 'CRITICAL' THEN 1 END) as critical_events,
          COUNT(DISTINCT shipment_id) as tracked_shipments,
          COUNT(DISTINCT source_id) as active_sources
        FROM tracking_events
        WHERE created_at BETWEEN :dateFrom AND :dateTo
      `;

      const result = await db.execute(query, { dateFrom, dateTo });
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to get tracking statistics: ${error.message}`);
    }
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    const json = {
      event_id: this.event_id,
      shipment_id: this.shipment_id,
      event_code: this.event_code,
      event_description: this.event_description,
      event_category: this.event_category,
      event_location: this.event_location,
      event_country: this.event_country,
      event_city: this.event_city,
      airport_code: this.airport_code,
      event_datetime: this.event_datetime,
      event_timezone: this.event_timezone,
      is_milestone: this.is_milestone,
      is_exception: this.is_exception,
      is_critical: this.is_critical,
      severity_level: this.severity_level,
      created_at: this.created_at
    };

    // Include related data if available
    if (this.milestone_name) {
      json.milestone = {
        milestone_id: this.milestone_id,
        milestone_name: this.milestone_name,
        milestone_category: this.milestone_category
      };
    }

    if (this.source_name) {
      json.source = {
        source_id: this.source_id,
        source_name: this.source_name
      };
    }

    // Include coordinates if available
    if (this.longitude && this.latitude) {
      json.coordinates = {
        longitude: this.longitude,
        latitude: this.latitude
      };
    }

    // Include environmental data if available
    if (this.temperature_celsius || this.humidity_percent) {
      json.environmental_data = {
        temperature_celsius: this.temperature_celsius,
        humidity_percent: this.humidity_percent
      };
    }

    // Parse additional info if it's JSON
    if (this.additional_info) {
      try {
        json.additional_info = JSON.parse(this.additional_info);
      } catch (e) {
        json.additional_info = this.additional_info;
      }
    }

    return json;
  }
}

module.exports = TrackingEvent;