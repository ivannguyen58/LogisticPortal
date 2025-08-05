const TrackingService = require('../services/TrackingService');
const Shipment = require('../models/Shipment');
const TrackingEvent = require('../models/TrackingEvent');
const { validationResult } = require('express-validator');

/**
 * TrackingController
 * Handles HTTP requests for shipment tracking functionality
 */
class TrackingController {
  constructor() {
    this.trackingService = new TrackingService();
  }

  /**
   * GET /api/v1/tracking/awb/:awbNumber
   * Get tracking information by AWB number (public endpoint)
   */
  async getTrackingByAwb(req, res) {
    try {
      const { awbNumber } = req.params;
      const { include_history = 'true', include_internal = 'false' } = req.query;

      // Validate AWB format
      if (!awbNumber || !/^\d{3}-\d{8}$/.test(awbNumber)) {
        return res.status(400).json({
          error: 'Invalid AWB number format. Expected format: XXX-XXXXXXXX'
        });
      }

      const trackingInfo = await this.trackingService.getTrackingByAwb(awbNumber, {
        includeHistory: include_history === 'true',
        includeInternal: include_internal === 'true'
      });

      // For public endpoint, return limited information
      const publicTrackingInfo = {
        awb_number: trackingInfo.shipment.awb_number,
        current_status: trackingInfo.current_status,
        current_location: trackingInfo.current_location,
        origin_airport: trackingInfo.shipment.origin_airport,
        destination_airport: trackingInfo.shipment.destination_airport,
        estimated_delivery: trackingInfo.estimated_delivery,
        has_exceptions: trackingInfo.has_exceptions
      };

      if (trackingInfo.latest_event) {
        publicTrackingInfo.latest_event = {
          event_description: trackingInfo.latest_event.event_description,
          event_location: trackingInfo.latest_event.event_location,
          event_datetime: trackingInfo.latest_event.event_datetime,
          is_milestone: trackingInfo.latest_event.is_milestone
        };
      }

      if (include_history === 'true' && trackingInfo.tracking_events) {
        publicTrackingInfo.tracking_events = trackingInfo.tracking_events
          .filter(event => event.customer_visible)
          .map(event => ({
            event_description: event.event_description,
            event_location: event.event_location,
            event_datetime: event.event_datetime,
            is_milestone: event.is_milestone,
            is_exception: event.is_exception
          }));
      }

      res.json({
        success: true,
        data: publicTrackingInfo
      });
    } catch (error) {
      console.error('Error getting tracking by AWB:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        error: error.message
      });
    }
  }

  /**
   * GET /api/v1/tracking/shipments/:shipmentId
   * Get detailed tracking information by shipment ID (authenticated)
   */
  async getTrackingById(req, res) {
    try {
      const { shipmentId } = req.params;
      const customerId = req.user?.customer_id;

      const trackingInfo = await this.trackingService.getTrackingById(shipmentId, customerId);

      res.json({
        success: true,
        data: trackingInfo
      });
    } catch (error) {
      console.error('Error getting tracking by ID:', error);
      res.status(error.message.includes('not found') || error.message.includes('denied') ? 404 : 500).json({
        error: error.message
      });
    }
  }

  /**
   * GET /api/v1/tracking/customer/:customerId/history
   * Get tracking history for a customer
   */
  async getCustomerTrackingHistory(req, res) {
    try {
      const { customerId } = req.params;
      const {
        limit = 50,
        offset = 0,
        status,
        date_from,
        date_to
      } = req.query;

      // Check if user has access to this customer's data
      if (req.user?.customer_id && req.user.customer_id !== customerId) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status,
        dateFrom: date_from ? new Date(date_from) : null,
        dateTo: date_to ? new Date(date_to) : null
      };

      const trackingHistory = await this.trackingService.getCustomerTrackingHistory(customerId, options);

      res.json({
        success: true,
        data: trackingHistory
      });
    } catch (error) {
      console.error('Error getting customer tracking history:', error);
      res.status(500).json({
        error: error.message
      });
    }
  }

  /**
   * POST /api/v1/tracking/events
   * Create a new tracking event
   */
  async createTrackingEvent(req, res) {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const {
        shipment_id,
        event_code,
        event_description,
        event_category = 'STATUS_UPDATE',
        event_location,
        event_country,
        event_city,
        airport_code,
        event_datetime,
        event_timezone = 'UTC',
        milestone_id,
        is_milestone = 0,
        is_exception = 0,
        is_critical = 0,
        severity_level = 'INFO',
        source_reference,
        additional_info,
        longitude,
        latitude,
        temperature_celsius,
        humidity_percent,
        customer_visible = 1
      } = req.body;

      const eventData = {
        event_code,
        event_description,
        event_category,
        event_location,
        event_country,
        event_city,
        airport_code,
        event_datetime: event_datetime ? new Date(event_datetime) : new Date(),
        event_timezone,
        milestone_id,
        is_milestone,
        is_exception,
        is_critical,
        severity_level,
        source_reference,
        additional_info,
        longitude,
        latitude,
        temperature_celsius,
        humidity_percent,
        customer_visible,
        created_by: req.user?.user_id
      };

      const trackingEvent = await this.trackingService.createTrackingEvent(
        shipment_id,
        eventData,
        'src-manual' // Manual entry source
      );

      res.status(201).json({
        success: true,
        data: trackingEvent.toJSON()
      });
    } catch (error) {
      console.error('Error creating tracking event:', error);
      res.status(error.message.includes('not found') ? 404 : 400).json({
        error: error.message
      });
    }
  }

  /**
   * POST /api/v1/tracking/update/:awbNumber
   * Update tracking from external sources
   */
  async updateTrackingFromExternal(req, res) {
    try {
      const { awbNumber } = req.params;
      const { source_type = 'IATA_ONERECORD' } = req.body;

      const result = await this.trackingService.updateTrackingFromExternal(awbNumber, source_type);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error updating tracking from external:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        error: error.message
      });
    }
  }

  /**
   * POST /api/v1/tracking/bulk-update
   * Bulk update tracking for multiple shipments
   */
  async bulkUpdateTracking(req, res) {
    try {
      const { shipment_ids, source_type = 'IATA_ONERECORD' } = req.body;

      if (!Array.isArray(shipment_ids) || shipment_ids.length === 0) {
        return res.status(400).json({
          error: 'shipment_ids must be a non-empty array'
        });
      }

      if (shipment_ids.length > 100) {
        return res.status(400).json({
          error: 'Maximum 100 shipments allowed per bulk update'
        });
      }

      const result = await this.trackingService.bulkUpdateTracking(shipment_ids, source_type);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error in bulk update tracking:', error);
      res.status(500).json({
        error: error.message
      });
    }
  }

  /**
   * GET /api/v1/tracking/shipments/:shipmentId/events
   * Get tracking events for a specific shipment
   */
  async getShipmentTrackingEvents(req, res) {
    try {
      const { shipmentId } = req.params;
      const {
        limit = 100,
        offset = 0,
        include_internal = 'false',
        event_category,
        milestones_only = 'false',
        exceptions_only = 'false'
      } = req.query;

      // Verify shipment exists and user has access
      const shipment = await Shipment.findById(shipmentId);
      if (!shipment) {
        return res.status(404).json({
          error: 'Shipment not found'
        });
      }

      // Check customer access
      if (req.user?.customer_id && shipment.customer_id !== req.user.customer_id) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        includeInternal: include_internal === 'true',
        eventCategory: event_category,
        milestonesOnly: milestones_only === 'true',
        exceptionsOnly: exceptions_only === 'true'
      };

      const result = await TrackingEvent.findByShipment(shipmentId, options);

      res.json({
        success: true,
        data: {
          events: result.events.map(event => event.toJSON()),
          pagination: {
            total: result.totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: (parseInt(offset) + parseInt(limit)) < result.totalCount
          }
        }
      });
    } catch (error) {
      console.error('Error getting shipment tracking events:', error);
      res.status(500).json({
        error: error.message
      });
    }
  }

  /**
   * POST /api/v1/tracking/subscribe
   * Subscribe to tracking notifications
   */
  async subscribeToTracking(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const {
        shipment_id,
        notification_method = 'EMAIL',
        notification_endpoint,
        milestone_notifications = 1,
        exception_notifications = 1,
        location_updates = 0,
        all_events = 0
      } = req.body;

      const customerId = req.user?.customer_id;
      if (!customerId) {
        return res.status(401).json({
          error: 'Customer authentication required'
        });
      }

      const notificationSettings = {
        notification_method,
        notification_endpoint,
        milestone_notifications,
        exception_notifications,
        location_updates,
        all_events
      };

      const result = await this.trackingService.subscribeToTracking(
        shipment_id,
        customerId,
        notificationSettings
      );

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error subscribing to tracking:', error);
      res.status(error.message.includes('not found') || error.message.includes('denied') ? 404 : 400).json({
        error: error.message
      });
    }
  }

  /**
   * GET /api/v1/tracking/statistics
   * Get tracking statistics
   */
  async getTrackingStatistics(req, res) {
    try {
      const {
        date_from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        date_to = new Date()
      } = req.query;

      const dateFrom = new Date(date_from);
      const dateTo = new Date(date_to);

      if (dateFrom >= dateTo) {
        return res.status(400).json({
          error: 'date_from must be before date_to'
        });
      }

      const stats = await this.trackingService.getTrackingStatistics(dateFrom, dateTo);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting tracking statistics:', error);
      res.status(500).json({
        error: error.message
      });
    }
  }

  /**
   * GET /api/v1/tracking/health
   * Health check for tracking service
   */
  async healthCheck(req, res) {
    try {
      // Check database connectivity
      const db = require('../config/database');
      const healthCheck = await db.healthCheck();

      // Check if there are any pending updates
      const pendingUpdates = await this.trackingService.getShipmentsForUpdate();

      const health = {
        status: healthCheck.status,
        timestamp: new Date().toISOString(),
        database: healthCheck,
        tracking: {
          pending_updates: pendingUpdates.length,
          service_status: 'operational'
        }
      };

      const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  /**
   * POST /api/v1/tracking/process-updates
   * Manually trigger automatic tracking updates (admin only)
   */
  async processAutomaticUpdates(req, res) {
    try {
      // Check admin permissions
      if (!req.user?.roles?.includes('ADMIN')) {
        return res.status(403).json({
          error: 'Admin access required'
        });
      }

      const result = await this.trackingService.processAutomaticUpdates();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error processing automatic updates:', error);
      res.status(500).json({
        error: error.message
      });
    }
  }

  /**
   * GET /api/v1/tracking/pending-updates
   * Get list of shipments pending tracking updates (admin only)
   */
  async getPendingUpdates(req, res) {
    try {
      // Check admin permissions
      if (!req.user?.roles?.includes('ADMIN')) {
        return res.status(403).json({
          error: 'Admin access required'
        });
      }

      const pendingShipments = await this.trackingService.getShipmentsForUpdate();

      res.json({
        success: true,
        data: {
          total_pending: pendingShipments.length,
          shipments: pendingShipments
        }
      });
    } catch (error) {
      console.error('Error getting pending updates:', error);
      res.status(500).json({
        error: error.message
      });
    }
  }
}

module.exports = TrackingController;