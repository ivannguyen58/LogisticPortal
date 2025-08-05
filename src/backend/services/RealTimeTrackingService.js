const { Server } = require('socket.io');
const TrackingService = require('./TrackingService');
const TrackingEvent = require('../models/TrackingEvent');
const config = require('../config/config');

/**
 * RealTimeTrackingService
 * Handles real-time tracking updates via WebSocket connections
 */
class RealTimeTrackingService {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.trackingService = new TrackingService();
    this.connectedClients = new Map(); // Store client connections with metadata
    this.roomSubscriptions = new Map(); // Track room subscriptions
    
    this.setupSocketHandlers();
    this.startPeriodicUpdates();
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Store client connection
      this.connectedClients.set(socket.id, {
        socket,
        connectedAt: new Date(),
        subscriptions: new Set(),
        userId: null,
        customerId: null
      });

      // Handle authentication
      socket.on('authenticate', async (data) => {
        try {
          await this.handleAuthentication(socket, data);
        } catch (error) {
          socket.emit('auth_error', { error: error.message });
        }
      });

      // Handle shipment subscription
      socket.on('subscribe_shipment', async (data) => {
        try {
          await this.handleShipmentSubscription(socket, data);
        } catch (error) {
          socket.emit('subscription_error', { error: error.message });
        }
      });

      // Handle shipment unsubscription
      socket.on('unsubscribe_shipment', async (data) => {
        try {
          await this.handleShipmentUnsubscription(socket, data);
        } catch (error) {
          socket.emit('subscription_error', { error: error.message });
        }
      });

      // Handle customer tracking subscription
      socket.on('subscribe_customer', async (data) => {
        try {
          await this.handleCustomerSubscription(socket, data);
        } catch (error) {
          socket.emit('subscription_error', { error: error.message });
        }
      });

      // Handle ping for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.handleDisconnection(socket, reason);
      });

      // Send welcome message
      socket.emit('connected', {
        clientId: socket.id,
        timestamp: new Date().toISOString(),
        features: {
          realTimeUpdates: config.tracking.enableRealTimeUpdates,
          updateInterval: config.tracking.defaultUpdateInterval
        }
      });
    });
  }

  /**
   * Handle client authentication
   */
  async handleAuthentication(socket, data) {
    const { token, userId, customerId } = data;

    // TODO: Verify JWT token here
    // For now, we'll accept the provided user/customer ID
    
    const clientInfo = this.connectedClients.get(socket.id);
    if (clientInfo) {
      clientInfo.userId = userId;
      clientInfo.customerId = customerId;
      clientInfo.authenticated = true;
    }

    socket.emit('authenticated', {
      userId,
      customerId,
      timestamp: new Date().toISOString()
    });

    console.log(`Client ${socket.id} authenticated as user ${userId}, customer ${customerId}`);
  }

  /**
   * Handle shipment subscription
   */
  async handleShipmentSubscription(socket, data) {
    const { shipmentId, awbNumber } = data;
    const clientInfo = this.connectedClients.get(socket.id);

    if (!clientInfo?.authenticated) {
      throw new Error('Authentication required');
    }

    let actualShipmentId = shipmentId;

    // If AWB provided, get shipment ID
    if (awbNumber && !shipmentId) {
      const Shipment = require('../models/Shipment');
      const shipment = await Shipment.findByAwb(awbNumber);
      if (!shipment) {
        throw new Error('Shipment not found');
      }
      actualShipmentId = shipment.shipment_id;
      
      // Check customer access
      if (clientInfo.customerId && shipment.customer_id !== clientInfo.customerId) {
        throw new Error('Access denied');
      }
    }

    // Join shipment room
    const roomName = `shipment:${actualShipmentId}`;
    socket.join(roomName);
    
    // Track subscription
    clientInfo.subscriptions.add(actualShipmentId);
    
    if (!this.roomSubscriptions.has(roomName)) {
      this.roomSubscriptions.set(roomName, new Set());
    }
    this.roomSubscriptions.get(roomName).add(socket.id);

    // Send current tracking status
    try {
      const trackingInfo = await this.trackingService.getTrackingById(actualShipmentId, clientInfo.customerId);
      socket.emit('tracking_update', {
        shipmentId: actualShipmentId,
        ...trackingInfo
      });
    } catch (error) {
      console.warn(`Failed to send initial tracking info: ${error.message}`);
    }

    socket.emit('subscribed', {
      shipmentId: actualShipmentId,
      awbNumber: awbNumber,
      room: roomName,
      timestamp: new Date().toISOString()
    });

    console.log(`Client ${socket.id} subscribed to shipment ${actualShipmentId}`);
  }

  /**
   * Handle shipment unsubscription
   */
  async handleShipmentUnsubscription(socket, data) {
    const { shipmentId } = data;
    const clientInfo = this.connectedClients.get(socket.id);

    if (!clientInfo) {
      return;
    }

    const roomName = `shipment:${shipmentId}`;
    socket.leave(roomName);
    
    // Remove subscription tracking
    clientInfo.subscriptions.delete(shipmentId);
    
    if (this.roomSubscriptions.has(roomName)) {
      this.roomSubscriptions.get(roomName).delete(socket.id);
      
      // Clean up empty rooms
      if (this.roomSubscriptions.get(roomName).size === 0) {
        this.roomSubscriptions.delete(roomName);
      }
    }

    socket.emit('unsubscribed', {
      shipmentId,
      timestamp: new Date().toISOString()
    });

    console.log(`Client ${socket.id} unsubscribed from shipment ${shipmentId}`);
  }

  /**
   * Handle customer tracking subscription (all customer's shipments)
   */
  async handleCustomerSubscription(socket, data) {
    const { customerId } = data;
    const clientInfo = this.connectedClients.get(socket.id);

    if (!clientInfo?.authenticated) {
      throw new Error('Authentication required');
    }

    // Check access rights
    if (clientInfo.customerId !== customerId) {
      throw new Error('Access denied');
    }

    // Join customer room
    const roomName = `customer:${customerId}`;
    socket.join(roomName);

    socket.emit('customer_subscribed', {
      customerId,
      room: roomName,
      timestamp: new Date().toISOString()
    });

    console.log(`Client ${socket.id} subscribed to customer ${customerId} updates`);
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(socket, reason) {
    console.log(`Client ${socket.id} disconnected: ${reason}`);
    
    const clientInfo = this.connectedClients.get(socket.id);
    if (clientInfo) {
      // Clean up room subscriptions
      clientInfo.subscriptions.forEach(shipmentId => {
        const roomName = `shipment:${shipmentId}`;
        if (this.roomSubscriptions.has(roomName)) {
          this.roomSubscriptions.get(roomName).delete(socket.id);
          
          if (this.roomSubscriptions.get(roomName).size === 0) {
            this.roomSubscriptions.delete(roomName);
          }
        }
      });
      
      // Remove client info
      this.connectedClients.delete(socket.id);
    }
  }

  /**
   * Broadcast tracking event to subscribed clients
   */
  async broadcastTrackingEvent(trackingEvent, shipment) {
    try {
      const roomName = `shipment:${trackingEvent.shipment_id}`;
      const customerRoom = `customer:${shipment.customer_id}`;

      // Prepare event data
      const eventData = {
        shipmentId: trackingEvent.shipment_id,
        awbNumber: shipment.awb_number,
        event: trackingEvent.toJSON(),
        shipment: {
          current_status: shipment.current_status,
          current_location: shipment.current_location,
          estimated_delivery_date: shipment.estimated_delivery_date
        },
        timestamp: new Date().toISOString()
      };

      // Broadcast to shipment-specific room
      this.io.to(roomName).emit('tracking_event', eventData);
      
      // Broadcast to customer room (for customer dashboard updates)
      this.io.to(customerRoom).emit('customer_tracking_update', {
        customerId: shipment.customer_id,
        shipmentUpdate: eventData
      });

      // Send push notifications for critical events
      if (trackingEvent.is_critical || trackingEvent.is_exception || trackingEvent.is_milestone) {
        this.io.to(roomName).emit('critical_update', {
          ...eventData,
          notification: {
            title: `${shipment.awb_number} - ${trackingEvent.event_description}`,
            body: trackingEvent.event_location ? `Location: ${trackingEvent.event_location}` : '',
            type: trackingEvent.is_exception ? 'exception' : 'milestone'
          }
        });
      }

      console.log(`Broadcasted tracking event for shipment ${trackingEvent.shipment_id} to ${this.io.sockets.adapter.rooms.get(roomName)?.size || 0} clients`);
    } catch (error) {
      console.error('Failed to broadcast tracking event:', error);
    }
  }

  /**
   * Broadcast bulk status updates
   */
  async broadcastBulkUpdates(updates) {
    try {
      for (const update of updates) {
        const { shipmentId, customerId, events } = update;
        
        const roomName = `shipment:${shipmentId}`;
        const customerRoom = `customer:${customerId}`;

        const updateData = {
          shipmentId,
          events: events.map(e => e.toJSON()),
          timestamp: new Date().toISOString()
        };

        this.io.to(roomName).emit('bulk_tracking_update', updateData);
        this.io.to(customerRoom).emit('customer_bulk_update', updateData);
      }

      console.log(`Broadcasted bulk updates for ${updates.length} shipments`);
    } catch (error) {
      console.error('Failed to broadcast bulk updates:', error);
    }
  }

  /**
   * Start periodic updates for active tracking
   */
  startPeriodicUpdates() {
    if (!config.tracking.enableRealTimeUpdates) {
      console.log('Real-time tracking updates disabled');
      return;
    }

    const interval = config.tracking.defaultUpdateInterval * 60 * 1000; // Convert to milliseconds
    
    setInterval(async () => {
      try {
        await this.processPeriodicUpdates();
      } catch (error) {
        console.error('Error in periodic updates:', error);
      }
    }, interval);

    console.log(`Started periodic tracking updates every ${config.tracking.defaultUpdateInterval} minutes`);
  }

  /**
   * Process periodic updates for actively tracked shipments
   */
  async processPeriodicUpdates() {
    try {
      // Get actively subscribed shipments
      const activeShipments = new Set();
      
      this.roomSubscriptions.forEach((clients, roomName) => {
        if (roomName.startsWith('shipment:') && clients.size > 0) {
          const shipmentId = roomName.replace('shipment:', '');
          activeShipments.add(shipmentId);
        }
      });

      if (activeShipments.size === 0) {
        return;
      }

      console.log(`Processing periodic updates for ${activeShipments.size} active shipments`);

      // Update tracking for active shipments
      const updatePromises = Array.from(activeShipments).map(async (shipmentId) => {
        try {
          const Shipment = require('../models/Shipment');
          const shipment = await Shipment.findById(shipmentId);
          
          if (!shipment || !shipment.tracking_enabled || shipment.current_status === 'DELIVERED') {
            return null;
          }

          // Update from external sources
          const result = await this.trackingService.updateTrackingFromExternal(shipment.awb_number);
          
          if (result.events_created > 0) {
            // Get the latest events to broadcast
            const latestEvents = await TrackingEvent.findByShipment(shipmentId, { limit: result.events_created });
            
            // Broadcast each new event
            for (const event of latestEvents.events) {
              await this.broadcastTrackingEvent(event, shipment);
            }
          }

          return result;
        } catch (error) {
          console.warn(`Failed to update shipment ${shipmentId}:`, error.message);
          return null;
        }
      });

      const results = await Promise.allSettled(updatePromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Periodic update completed: ${successful} successful, ${failed} failed`);
    } catch (error) {
      console.error('Error in periodic updates:', error);
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const now = new Date();
    const stats = {
      totalConnections: this.connectedClients.size,
      authenticatedConnections: 0,
      totalSubscriptions: 0,
      activeRooms: this.roomSubscriptions.size,
      connectionsByDuration: {
        under1min: 0,
        under5min: 0,
        under1hour: 0,
        over1hour: 0
      }
    };

    this.connectedClients.forEach((client) => {
      if (client.authenticated) {
        stats.authenticatedConnections++;
      }
      
      stats.totalSubscriptions += client.subscriptions.size;
      
      const duration = now - client.connectedAt;
      const minutes = duration / (1000 * 60);
      
      if (minutes < 1) {
        stats.connectionsByDuration.under1min++;
      } else if (minutes < 5) {
        stats.connectionsByDuration.under5min++;
      } else if (minutes < 60) {
        stats.connectionsByDuration.under1hour++;
      } else {
        stats.connectionsByDuration.over1hour++;
      }
    });

    return stats;
  }

  /**
   * Broadcast system notification to all connected clients
   */
  broadcastSystemNotification(notification) {
    this.io.emit('system_notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Close all connections and cleanup
   */
  async close() {
    console.log('Closing real-time tracking service...');
    
    // Notify all clients of shutdown
    this.io.emit('service_shutdown', {
      message: 'Real-time tracking service is shutting down',
      timestamp: new Date().toISOString()
    });

    // Close all connections
    this.io.close();
    
    // Clear data structures
    this.connectedClients.clear();
    this.roomSubscriptions.clear();
    
    console.log('Real-time tracking service closed');
  }
}

module.exports = RealTimeTrackingService;