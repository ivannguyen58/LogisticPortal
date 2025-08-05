const express = require('express');
const { body, param, query } = require('express-validator');
const TrackingController = require('../controllers/TrackingController');
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');

const router = express.Router();
const trackingController = new TrackingController();

// Validation schemas
const awbValidation = param('awbNumber')
  .matches(/^\d{3}-\d{8}$/)
  .withMessage('Invalid AWB format. Expected: XXX-XXXXXXXX');

const uuidValidation = param('shipmentId')
  .isUUID()
  .withMessage('Invalid shipment ID format');

const createEventValidation = [
  body('shipment_id').isUUID().withMessage('Invalid shipment ID'),
  body('event_code').notEmpty().withMessage('Event code is required'),
  body('event_description').notEmpty().withMessage('Event description is required'),
  body('event_category').optional().isIn(['STATUS_UPDATE', 'LOCATION_UPDATE', 'MILESTONE', 'EXCEPTION', 'NOTIFICATION']),
  body('event_datetime').optional().isISO8601().withMessage('Invalid datetime format'),
  body('is_milestone').optional().isBoolean(),
  body('is_exception').optional().isBoolean(),
  body('is_critical').optional().isBoolean(),
  body('severity_level').optional().isIn(['INFO', 'WARNING', 'ERROR', 'CRITICAL']),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('temperature_celsius').optional().isFloat({ min: -273.15, max: 200 }),
  body('humidity_percent').optional().isFloat({ min: 0, max: 100 })
];

const subscriptionValidation = [
  body('shipment_id').isUUID().withMessage('Invalid shipment ID'),
  body('notification_method').isIn(['EMAIL', 'SMS', 'PUSH', 'WEBHOOK']).withMessage('Invalid notification method'),
  body('notification_endpoint').notEmpty().withMessage('Notification endpoint is required'),
  body('milestone_notifications').optional().isBoolean(),
  body('exception_notifications').optional().isBoolean(),
  body('location_updates').optional().isBoolean(),
  body('all_events').optional().isBoolean()
];

// Public tracking endpoints (with rate limiting)
router.get('/awb/:awbNumber', 
  awbValidation,
  rateLimitMiddleware.publicTracking,
  trackingController.getTrackingByAwb.bind(trackingController)
);

// Authenticated tracking endpoints
router.get('/shipments/:shipmentId',
  authMiddleware.requireAuth,
  uuidValidation,
  trackingController.getTrackingById.bind(trackingController)
);

router.get('/customer/:customerId/history',
  authMiddleware.requireAuth,
  param('customerId').isUUID().withMessage('Invalid customer ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  query('date_from').optional().isISO8601().withMessage('Invalid date_from format'),
  query('date_to').optional().isISO8601().withMessage('Invalid date_to format'),
  trackingController.getCustomerTrackingHistory.bind(trackingController)
);

router.get('/shipments/:shipmentId/events',
  authMiddleware.requireAuth,
  uuidValidation,
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  trackingController.getShipmentTrackingEvents.bind(trackingController)
);

// Create tracking event (employee/admin only)
router.post('/events',
  authMiddleware.requireAuth,
  authMiddleware.requireRole(['EMPLOYEE', 'ADMIN']),
  createEventValidation,
  trackingController.createTrackingEvent.bind(trackingController)
);

// Update tracking from external sources
router.post('/update/:awbNumber',
  authMiddleware.requireAuth,
  authMiddleware.requireRole(['EMPLOYEE', 'ADMIN']),
  awbValidation,
  body('source_type').optional().isIn(['IATA_ONERECORD', 'AIRLINE', 'CUSTOMS', 'MANUAL']),
  trackingController.updateTrackingFromExternal.bind(trackingController)
);

// Bulk update tracking
router.post('/bulk-update',
  authMiddleware.requireAuth,
  authMiddleware.requireRole(['EMPLOYEE', 'ADMIN']),
  body('shipment_ids').isArray({ min: 1, max: 100 }).withMessage('shipment_ids must be array with 1-100 items'),
  body('shipment_ids.*').isUUID().withMessage('All shipment IDs must be valid UUIDs'),
  body('source_type').optional().isIn(['IATA_ONERECORD', 'AIRLINE', 'CUSTOMS', 'MANUAL']),
  trackingController.bulkUpdateTracking.bind(trackingController)
);

// Notification subscription
router.post('/subscribe',
  authMiddleware.requireAuth,
  authMiddleware.requireRole(['CUSTOMER']),
  subscriptionValidation,
  trackingController.subscribeToTracking.bind(trackingController)
);

// Statistics (admin only)
router.get('/statistics',
  authMiddleware.requireAuth,
  authMiddleware.requireRole(['ADMIN']),
  query('date_from').optional().isISO8601().withMessage('Invalid date_from format'),
  query('date_to').optional().isISO8601().withMessage('Invalid date_to format'),
  trackingController.getTrackingStatistics.bind(trackingController)
);

// Admin endpoints
router.post('/process-updates',
  authMiddleware.requireAuth,
  authMiddleware.requireRole(['ADMIN']),
  trackingController.processAutomaticUpdates.bind(trackingController)
);

router.get('/pending-updates',
  authMiddleware.requireAuth,
  authMiddleware.requireRole(['ADMIN']),
  trackingController.getPendingUpdates.bind(trackingController)
);

// Health check
router.get('/health',
  trackingController.healthCheck.bind(trackingController)
);

module.exports = router;