const Shipment = require('../models/Shipment');
const TrackingEvent = require('../models/TrackingEvent');
const NotificationService = require('./NotificationService');
const IATAOneRecordService = require('./IATAOneRecordService');
const config = require('../config/config');

/**
 * TrackingService
 * Core business logic for shipment tracking
 */
class TrackingService {
  constructor() {
    this.notificationService = new NotificationService();
    this.iataService = new IATAOneRecordService();
  }

  /**
   * Get tracking information for a shipment by AWB
   */
  async getTrackingByAwb(awbNumber, options = {}) {
    try {
      const {
        includeHistory = true,
        includeInternal = false,
        customerId = null
      } = options;

      // Find shipment by AWB
      const shipment = await Shipment.findByAwb(awbNumber);
      if (!shipment) {
        throw new Error('Shipment not found');
      }

      // Check customer access if customerId provided
      if (customerId && shipment.customer_id !== customerId) {
        throw new Error('Access denied');
      }

      // Get basic shipment info
      const trackingInfo = {
        shipment: shipment.toJSON(),
        current_status: shipment.current_status,
        current_location: shipment.current_location,
        estimated_delivery: shipment.estimated_delivery_date,
        tracking_summary: await shipment.getTrackingSummary()
      };

      // Include tracking history if requested
      if (includeHistory) {
        const historyOptions = {
          includeInternal,
          limit: 100
        };
        
        trackingInfo.tracking_events = await shipment.getTrackingHistory(historyOptions);
        trackingInfo.latest_event = await shipment.getLatestTrackingEvent();
      }

      // Check for exceptions
      trackingInfo.has_exceptions = await shipment.hasExceptions();

      return trackingInfo;
    } catch (error) {
      throw new Error(`Failed to get tracking info: ${error.message}`);
    }
  }

  /**
   * Get tracking information for a shipment by ID
   */
  async getTrackingById(shipmentId, customerId = null) {
    try {
      const shipment = await Shipment.findById(shipmentId);
      if (!shipment) {
        throw new Error('Shipment not found');
      }

      // Check customer access
      if (customerId && shipment.customer_id !== customerId) {
        throw new Error('Access denied');
      }

      return await this.getTrackingByAwb(shipment.awb_number, { customerId });
    } catch (error) {
      throw new Error(`Failed to get tracking info by ID: ${error.message}`);
    }
  }

  /**
   * Get tracking history for multiple shipments
   */
  async getCustomerTrackingHistory(customerId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        status = null,
        dateFrom = null,
        dateTo = null
      } = options;

      const shipmentsResult = await Shipment.findByCustomer(customerId, {
        limit,
        offset,
        status,
        dateFrom,
        dateTo,
        orderBy: 'created_at',
        orderDirection: 'DESC'
      });

      const trackingHistory = [];

      for (const shipment of shipmentsResult.shipments) {
        const latestEvent = await shipment.getLatestTrackingEvent();
        const summary = await shipment.getTrackingSummary();
        
        trackingHistory.push({
          shipment: shipment.toJSON(),
          latest_event: latestEvent?.toJSON() || null,
          summary
        });
      }

      return {
        tracking_history: trackingHistory,
        pagination: {
          total: shipmentsResult.totalCount,
          limit,
          offset,
          hasMore: (offset + limit) < shipmentsResult.totalCount
        }
      };
    } catch (error) {
      throw new Error(`Failed to get customer tracking history: ${error.message}`);
    }
  }

  /**
   * Create a new tracking event
   */
  async createTrackingEvent(shipmentId, eventData, sourceId = null) {
    try {
      // Validate shipment exists
      const shipment = await Shipment.findById(shipmentId);
      if (!shipment) {
        throw new Error('Shipment not found');
      }

      // Check for duplicates
      const isDuplicate = await TrackingEvent.checkDuplicate(
        shipmentId,
        eventData.event_code,
        eventData.event_datetime,
        eventData.external_event_id
      );

      if (isDuplicate) {
        throw new Error('Duplicate tracking event');
      }

      // Create tracking event
      const trackingEvent = new TrackingEvent({
        shipment_id: shipmentId,
        event_code: eventData.event_code,
        event_description: eventData.event_description,
        event_category: eventData.event_category || 'STATUS_UPDATE',
        event_location: eventData.event_location,
        event_country: eventData.event_country,
        event_city: eventData.event_city,
        airport_code: eventData.airport_code,
        event_datetime: eventData.event_datetime || new Date(),
        event_timezone: eventData.event_timezone || 'UTC',
        milestone_id: eventData.milestone_id,
        is_milestone: eventData.is_milestone || 0,
        is_exception: eventData.is_exception || 0,
        is_critical: eventData.is_critical || 0,
        severity_level: eventData.severity_level || 'INFO',
        source_id: sourceId,
        external_event_id: eventData.external_event_id,
        source_reference: eventData.source_reference,
        additional_info: eventData.additional_info ? JSON.stringify(eventData.additional_info) : null,
        longitude: eventData.longitude,
        latitude: eventData.latitude,
        temperature_celsius: eventData.temperature_celsius,
        humidity_percent: eventData.humidity_percent,
        customer_visible: eventData.customer_visible !== undefined ? eventData.customer_visible : 1,
        created_by: eventData.created_by
      });

      await trackingEvent.create();

      // Send notifications if it's a milestone or exception
      if (trackingEvent.is_milestone || trackingEvent.is_exception || trackingEvent.is_critical) {
        await this.sendTrackingNotifications(trackingEvent, shipment);
      }

      return trackingEvent;
    } catch (error) {
      throw new Error(`Failed to create tracking event: ${error.message}`);
    }
  }

  /**
   * Update shipment tracking from external sources
   */
  async updateTrackingFromExternal(awbNumber, sourceType = 'IATA_ONERECORD') {
    try {
      const shipment = await Shipment.findByAwb(awbNumber);
      if (!shipment) {
        throw new Error('Shipment not found');
      }

      if (!shipment.tracking_enabled) {
        throw new Error('Tracking disabled for this shipment');
      }

      let trackingData = [];

      // Fetch from different sources based on type
      switch (sourceType) {
        case 'IATA_ONERECORD':
          if (config.externalApis.iataOneRecord.enabled) {
            trackingData = await this.iataService.getTrackingData(awbNumber);
          }
          break;
        
        case 'AIRLINE':
          // Implementation for airline APIs
          trackingData = await this.fetchFromAirlineApi(shipment);
          break;
        
        case 'CUSTOMS':
          // Implementation for customs APIs
          trackingData = await this.fetchFromCustomsApi(shipment);
          break;
        
        default:
          throw new Error('Unsupported tracking source');
      }

      // Process and create tracking events
      const createdEvents = [];
      for (const eventData of trackingData) {
        try {
          const trackingEvent = await TrackingEvent.createFromExternal(
            eventData,
            this.getSourceId(sourceType),
            shipment.shipment_id
          );
          createdEvents.push(trackingEvent);
        } catch (error) {
          console.warn(`Failed to create tracking event: ${error.message}`);
          // Continue with other events
        }
      }

      // Update shipment's last tracked time
      await shipment.updateTrackingConfig({
        tracking_enabled: shipment.tracking_enabled,
        tracking_frequency_minutes: shipment.tracking_frequency_minutes,
        last_tracked_at: new Date()
      });

      return {
        shipment_id: shipment.shipment_id,
        awb_number: awbNumber,
        source: sourceType,
        events_created: createdEvents.length,
        events: createdEvents.map(e => e.toJSON())
      };
    } catch (error) {
      throw new Error(`Failed to update tracking from external: ${error.message}`);
    }
  }

  /**
   * Bulk update tracking for multiple shipments
   */
  async bulkUpdateTracking(shipmentIds, sourceType = 'IATA_ONERECORD') {
    const results = [];
    const errors = [];

    for (const shipmentId of shipmentIds) {
      try {
        const shipment = await Shipment.findById(shipmentId);
        if (!shipment) {
          errors.push({ shipmentId, error: 'Shipment not found' });
          continue;
        }

        const result = await this.updateTrackingFromExternal(shipment.awb_number, sourceType);
        results.push(result);
      } catch (error) {
        errors.push({ shipmentId, error: error.message });
      }
    }

    return {
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Get shipments that need tracking updates
   */
  async getShipmentsForUpdate() {
    try {
      const query = `
        SELECT shipment_id, awb_number, tracking_frequency_minutes, last_tracked_at
        FROM shipments
        WHERE tracking_enabled = 1
        AND current_status NOT IN ('DELIVERED', 'CANCELLED')
        AND (
          last_tracked_at IS NULL OR
          last_tracked_at < SYSDATE - (tracking_frequency_minutes / 1440)
        )
        ORDER BY last_tracked_at ASC NULLS FIRST
        FETCH FIRST 100 ROWS ONLY
      `;

      const db = require('../config/database');
      const result = await db.execute(query);
      
      return result.rows.map(row => ({
        shipment_id: row.shipment_id,
        awb_number: row.awb_number,
        tracking_frequency_minutes: row.tracking_frequency_minutes,
        last_tracked_at: row.last_tracked_at,
        update_due: true
      }));
    } catch (error) {
      throw new Error(`Failed to get shipments for update: ${error.message}`);
    }
  }

  /**
   * Process automatic tracking updates
   */
  async processAutomaticUpdates() {
    try {
      const shipments = await this.getShipmentsForUpdate();
      console.log(`Processing automatic updates for ${shipments.length} shipments`);

      const results = [];
      for (const shipment of shipments) {
        try {
          const result = await this.updateTrackingFromExternal(shipment.awb_number);
          results.push({
            shipment_id: shipment.shipment_id,
            awb_number: shipment.awb_number,
            status: 'success',
            events_created: result.events_created
          });
        } catch (error) {
          results.push({
            shipment_id: shipment.shipment_id,
            awb_number: shipment.awb_number,
            status: 'error',
            error: error.message
          });
        }
      }

      return {
        processed: shipments.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
        results
      };
    } catch (error) {
      throw new Error(`Failed to process automatic updates: ${error.message}`);
    }
  }

  /**
   * Send tracking notifications
   */
  async sendTrackingNotifications(trackingEvent, shipment) {
    try {
      // Get subscription preferences for this shipment
      const query = `
        SELECT * FROM tracking_subscriptions
        WHERE shipment_id = :shipment_id
        AND is_active = 1
        AND (
          (milestone_notifications = 1 AND :is_milestone = 1) OR
          (exception_notifications = 1 AND :is_exception = 1) OR
          (all_events = 1)
        )
      `;

      const db = require('../config/database');
      const result = await db.execute(query, {
        shipment_id: shipment.shipment_id,
        is_milestone: trackingEvent.is_milestone,
        is_exception: trackingEvent.is_exception
      });

      // Send notifications to each subscriber
      for (const subscription of result.rows) {
        try {
          await this.notificationService.sendTrackingNotification(
            subscription,
            trackingEvent,
            shipment
          );
        } catch (error) {
          console.error(`Failed to send notification: ${error.message}`);
        }
      }

      // Mark event as notification sent
      await trackingEvent.markNotificationSent();
    } catch (error) {
      console.error(`Failed to send tracking notifications: ${error.message}`);
    }
  }

  /**
   * Subscribe to tracking notifications
   */
  async subscribeToTracking(shipmentId, customerId, notificationSettings) {
    try {
      const {
        notification_method = 'EMAIL',
        notification_endpoint,
        milestone_notifications = 1,
        exception_notifications = 1,
        location_updates = 0,
        all_events = 0
      } = notificationSettings;

      // Verify shipment belongs to customer
      const shipment = await Shipment.findById(shipmentId);
      if (!shipment || shipment.customer_id !== customerId) {
        throw new Error('Shipment not found or access denied');
      }

      const query = `
        INSERT INTO tracking_subscriptions (
          subscription_id, shipment_id, customer_id, notification_method,
          notification_endpoint, milestone_notifications, exception_notifications,
          location_updates, all_events, is_active
        ) VALUES (
          :subscription_id, :shipment_id, :customer_id, :notification_method,
          :notification_endpoint, :milestone_notifications, :exception_notifications,
          :location_updates, :all_events, 1
        )
      `;

      const { v4: uuidv4 } = require('uuid');
      const subscriptionId = uuidv4();

      const db = require('../config/database');
      await db.execute(query, {
        subscription_id: subscriptionId,
        shipment_id: shipmentId,
        customer_id: customerId,
        notification_method,
        notification_endpoint,
        milestone_notifications,
        exception_notifications,
        location_updates,
        all_events
      });

      return {
        subscription_id: subscriptionId,
        shipment_id: shipmentId,
        status: 'subscribed'
      };
    } catch (error) {
      throw new Error(`Failed to subscribe to tracking: ${error.message}`);
    }
  }

  /**
   * Get tracking statistics
   */
  async getTrackingStatistics(dateFrom, dateTo) {
    try {
      const stats = await TrackingEvent.getTrackingStatistics(dateFrom, dateTo);
      
      // Add shipment statistics
      const shipmentQuery = `
        SELECT 
          COUNT(*) as total_shipments,
          COUNT(CASE WHEN current_status = 'DELIVERED' THEN 1 END) as delivered_shipments,
          COUNT(CASE WHEN current_status IN ('DEPARTED', 'IN_TRANSIT', 'ARRIVED') THEN 1 END) as in_transit_shipments,
          COUNT(CASE WHEN tracking_enabled = 1 THEN 1 END) as tracking_enabled_shipments
        FROM shipments
        WHERE created_at BETWEEN :dateFrom AND :dateTo
      `;

      const db = require('../config/database');
      const shipmentResult = await db.execute(shipmentQuery, { dateFrom, dateTo });
      
      return {
        period: { from: dateFrom, to: dateTo },
        tracking_events: stats,
        shipments: shipmentResult.rows[0]
      };
    } catch (error) {
      throw new Error(`Failed to get tracking statistics: ${error.message}`);
    }
  }

  /**
   * Helper methods
   */
  getSourceId(sourceType) {
    const sourceMapping = {
      'IATA_ONERECORD': 'src-iata',
      'AIRLINE': 'src-airline',
      'CUSTOMS': 'src-customs',
      'MANUAL': 'src-manual'
    };
    return sourceMapping[sourceType] || 'src-manual';
  }

  async fetchFromAirlineApi(shipment) {
    // Placeholder for airline API integration
    // This would integrate with specific airline APIs
    return [];
  }

  async fetchFromCustomsApi(shipment) {
    // Placeholder for customs API integration
    // This would integrate with customs systems
    return [];
  }
}

module.exports = TrackingService;