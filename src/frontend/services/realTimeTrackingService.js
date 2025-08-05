import { io } from 'socket.io-client';

/**
 * Real-time tracking service client
 * Manages WebSocket connections for live tracking updates
 */
class RealTimeTrackingService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.subscriptions = new Set();
    this.eventHandlers = new Map();
    
    // Configuration
    this.config = {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
      autoConnect: false
    };
  }

  /**
   * Connect to the real-time tracking service
   */
  connect(serverUrl = null) {
    const url = serverUrl || this.getServerUrl();
    
    if (this.socket && this.socket.connected) {
      console.warn('Already connected to tracking service');
      return Promise.resolve();
    }

    console.log('Connecting to real-time tracking service:', url);

    return new Promise((resolve, reject) => {
      this.socket = io(url, this.config);

      // Connection successful
      this.socket.on('connect', () => {
        console.log('Connected to tracking service');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        
        this.emit('connection:established');
        resolve();
      });

      // Connection failed
      this.socket.on('connect_error', (error) => {
        console.error('Failed to connect to tracking service:', error);
        this.isConnected = false;
        
        if (this.reconnectAttempts === 0) {
          reject(error);
        }
      });

      // Connection lost
      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from tracking service:', reason);
        this.isConnected = false;
        this.isAuthenticated = false;
        
        this.emit('connection:lost', { reason });

        // Attempt to reconnect for certain disconnect reasons
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, don't reconnect automatically
          this.emit('connection:terminated');
        } else {
          this.handleReconnect();
        }
      });

      // Server messages
      this.socket.on('connected', (data) => {
        console.log('Received welcome message:', data);
        this.emit('service:welcome', data);
      });

      this.socket.on('authenticated', (data) => {
        console.log('Authentication successful:', data);
        this.isAuthenticated = true;
        this.emit('auth:success', data);
      });

      this.socket.on('auth_error', (data) => {
        console.error('Authentication failed:', data);
        this.emit('auth:error', data);
      });

      // Tracking events
      this.socket.on('tracking_event', (data) => {
        console.log('Received tracking event:', data);
        this.emit('tracking:event', data);
      });

      this.socket.on('bulk_tracking_update', (data) => {
        console.log('Received bulk tracking update:', data);
        this.emit('tracking:bulk_update', data);
      });

      this.socket.on('critical_update', (data) => {
        console.log('Received critical update:', data);
        this.emit('tracking:critical', data);
        
        // Show browser notification if permitted
        this.showBrowserNotification(data.notification);
      });

      this.socket.on('customer_tracking_update', (data) => {
        console.log('Received customer tracking update:', data);
        this.emit('customer:update', data);
      });

      this.socket.on('customer_bulk_update', (data) => {
        console.log('Received customer bulk update:', data);
        this.emit('customer:bulk_update', data);
      });

      // Subscription confirmations
      this.socket.on('subscribed', (data) => {
        console.log('Subscription confirmed:', data);
        this.subscriptions.add(data.shipmentId);
        this.emit('subscription:confirmed', data);
      });

      this.socket.on('unsubscribed', (data) => {
        console.log('Unsubscription confirmed:', data);
        this.subscriptions.delete(data.shipmentId);
        this.emit('subscription:removed', data);
      });

      this.socket.on('customer_subscribed', (data) => {
        console.log('Customer subscription confirmed:', data);
        this.emit('customer:subscribed', data);
      });

      this.socket.on('subscription_error', (data) => {
        console.error('Subscription error:', data);
        this.emit('subscription:error', data);
      });

      // System notifications
      this.socket.on('system_notification', (data) => {
        console.log('System notification:', data);
        this.emit('system:notification', data);
      });

      this.socket.on('service_shutdown', (data) => {
        console.warn('Service shutdown notification:', data);
        this.emit('system:shutdown', data);
      });

      // Ping/Pong for connection health
      this.socket.on('pong', (data) => {
        this.emit('connection:pong', data);
      });

      // Set connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, this.config.timeout);
    });
  }

  /**
   * Authenticate with the service
   */
  authenticate(authData) {
    if (!this.isConnected) {
      throw new Error('Not connected to tracking service');
    }

    const { token, userId, customerId } = authData;
    
    this.socket.emit('authenticate', {
      token,
      userId,
      customerId
    });
  }

  /**
   * Subscribe to shipment tracking updates
   */
  subscribeToShipment(shipmentId, awbNumber = null) {
    if (!this.isConnected) {
      throw new Error('Not connected to tracking service');
    }

    if (!this.isAuthenticated) {
      throw new Error('Authentication required');
    }

    this.socket.emit('subscribe_shipment', {
      shipmentId,
      awbNumber
    });
  }

  /**
   * Unsubscribe from shipment tracking updates
   */
  unsubscribeFromShipment(shipmentId) {
    if (!this.isConnected) {
      return;
    }

    this.socket.emit('unsubscribe_shipment', {
      shipmentId
    });
  }

  /**
   * Subscribe to all customer tracking updates
   */
  subscribeToCustomer(customerId) {
    if (!this.isConnected) {
      throw new Error('Not connected to tracking service');
    }

    if (!this.isAuthenticated) {
      throw new Error('Authentication required');
    }

    this.socket.emit('subscribe_customer', {
      customerId
    });
  }

  /**
   * Send ping to check connection health
   */
  ping() {
    if (this.isConnected) {
      this.socket.emit('ping');
    }
  }

  /**
   * Disconnect from the service
   */
  disconnect() {
    if (this.socket) {
      console.log('Disconnecting from tracking service');
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.isAuthenticated = false;
    this.subscriptions.clear();
  }

  /**
   * Handle reconnection attempts
   */
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('connection:failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.emit('connection:reconnecting', { attempt: this.reconnectAttempts });
        this.socket.connect();
      }
    }, delay);
  }

  /**
   * Add event listener
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);
  }

  /**
   * Remove event listener
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).delete(handler);
      
      if (this.eventHandlers.get(event).size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Emit event to registered handlers
   */
  emit(event, data = null) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Show browser notification
   */
  async showBrowserNotification(notification) {
    if (!notification || !('Notification' in window)) {
      return;
    }

    // Request permission if not already granted
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }
    }

    if (Notification.permission === 'granted') {
      const options = {
        body: notification.body,
        icon: '/icons/tracking-notification.png',
        badge: '/icons/tracking-badge.png',
        tag: `tracking-${notification.type}`,
        requireInteraction: notification.type === 'exception',
        data: notification
      };

      const notif = new Notification(notification.title, options);
      
      notif.onclick = () => {
        window.focus();
        notif.close();
        
        // Emit click event for handling
        this.emit('notification:click', notification);
      };

      // Auto-close after 5 seconds for non-critical notifications
      if (notification.type !== 'exception') {
        setTimeout(() => notif.close(), 5000);
      }
    }
  }

  /**
   * Get server URL based on current location
   */
  getServerUrl() {
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location;
      const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
      const serverPort = process.env.REACT_APP_API_PORT || port;
      return `${wsProtocol}//${hostname}:${serverPort}`;
    }
    
    return process.env.REACT_APP_TRACKING_WS_URL || 'ws://localhost:3000';
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      subscriptions: Array.from(this.subscriptions),
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Get connection health
   */
  async checkHealth() {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve({ healthy: false, reason: 'Not connected' });
        return;
      }

      const timeout = setTimeout(() => {
        resolve({ healthy: false, reason: 'Ping timeout' });
      }, 5000);

      const handlePong = () => {
        clearTimeout(timeout);
        this.off('connection:pong', handlePong);
        resolve({ healthy: true, latency: Date.now() - pingTime });
      };

      this.on('connection:pong', handlePong);
      
      const pingTime = Date.now();
      this.ping();
    });
  }
}

// Export singleton instance
const realTimeTrackingService = new RealTimeTrackingService();
export default realTimeTrackingService;