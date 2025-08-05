const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const config = require('./config/config');
const database = require('./config/database');
const trackingRoutes = require('./routes/tracking');
const RealTimeTrackingService = require('./services/RealTimeTrackingService');

/**
 * ALSC Customer Portal - Backend Server
 * Main application entry point
 */
class Server {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.realTimeService = null;
  }

  /**
   * Initialize all middleware and services
   */
  async initialize() {
    try {
      console.log('🚀 Starting ALSC Customer Portal Backend...');
      console.log(`Environment: ${config.server.environment}`);
      console.log(`Node.js Version: ${process.version}`);

      // Initialize database
      await this.initializeDatabase();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Initialize real-time tracking service
      this.initializeRealTimeService();

      // Setup error handlers
      this.setupErrorHandlers();

      console.log('✅ Server initialization completed');
    } catch (error) {
      console.error('❌ Failed to initialize server:', error);
      process.exit(1);
    }
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase() {
    try {
      console.log('📊 Initializing database connection...');
      await database.initialize();
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    console.log('🔧 Setting up middleware...');

    // Security middleware
    if (config.security.helmetEnabled) {
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
          }
        },
        crossOriginEmbedderPolicy: false
      }));
    }

    // CORS configuration
    this.app.use(cors(config.cors));

    // Request logging
    const logFormat = config.server.environment === 'production' 
      ? 'combined' 
      : 'dev';
    this.app.use(morgan(logFormat));

    // Rate limiting
    if (config.security.rateLimitEnabled) {
      const limiter = rateLimit({
        windowMs: config.api.rateLimit.windowMs,
        max: config.api.rateLimit.max,
        message: {
          error: 'Too many requests from this IP, please try again later.',
          retryAfter: Math.ceil(config.api.rateLimit.windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          console.warn(`Rate limit exceeded for IP: ${req.ip}`);
          res.status(429).json({
            error: 'Too many requests from this IP, please try again later.',
            retryAfter: Math.ceil(config.api.rateLimit.windowMs / 1000)
          });
        }
      });
      this.app.use(limiter);
    }

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      type: 'application/json'
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Request ID middleware for tracing
    this.app.use((req, res, next) => {
      req.id = require('uuid').v4();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Request timing middleware
    this.app.use((req, res, next) => {
      req.startTime = Date.now();
      
      const originalSend = res.send;
      res.send = function(data) {
        const duration = Date.now() - req.startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
        return originalSend.call(this, data);
      };
      
      next();
    });

    console.log('✅ Middleware setup completed');
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    console.log('🛣️  Setting up routes...');

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const dbHealth = await database.healthCheck();
        const uptime = Math.floor(process.uptime());
        
        const health = {
          status: dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: `${uptime}s`,
          version: process.env.npm_package_version || '1.0.0',
          environment: config.server.environment,
          database: dbHealth,
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024)
          }
        };

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });

    // API routes
    this.app.use('/api/v1/tracking', trackingRoutes);

    // API documentation endpoint
    this.app.get('/api/v1', (req, res) => {
      res.json({
        name: 'ALSC Customer Portal API',
        version: '1.0.0',
        description: 'Customer Online Portal API for logistics tracking',
        documentation: '/docs',
        endpoints: {
          tracking: '/api/v1/tracking',
          health: '/health'
        },
        realTime: {
          websocket: config.tracking.enableRealTimeUpdates,
          endpoint: '/socket.io'
        }
      });
    });

    // Serve static files (if any)
    this.app.use('/static', express.static('public'));

    // Handle 404 for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    console.log('✅ Routes setup completed');
  }

  /**
   * Initialize real-time tracking service
   */
  initializeRealTimeService() {
    if (config.tracking.enableRealTimeUpdates) {
      console.log('🔄 Initializing real-time tracking service...');
      this.realTimeService = new RealTimeTrackingService(this.server);
      console.log('✅ Real-time tracking service initialized');
    } else {
      console.log('⏸️  Real-time tracking disabled');
    }
  }

  /**
   * Setup error handling middleware
   */
  setupErrorHandlers() {
    console.log('🛡️  Setting up error handlers...');

    // 404 handler for non-API routes
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id
      });

      // Don't send error details in production
      const isDevelopment = config.server.environment === 'development';
      
      res.status(error.status || 500).json({
        error: error.message || 'Internal Server Error',
        requestId: req.id,
        timestamp: new Date().toISOString(),
        ...(isDevelopment && { 
          stack: error.stack,
          details: error.details 
        })
      });
    });

    console.log('✅ Error handlers setup completed');
  }

  /**
   * Start the server
   */
  async start() {
    try {
      await this.initialize();

      const port = config.server.port;
      const host = config.server.host;

      this.server.listen(port, host, () => {
        console.log('\n🎉 ALSC Customer Portal Backend Started Successfully!');
        console.log(`📍 Server: http://${host}:${port}`);
        console.log(`📊 Health: http://${host}:${port}/health`);
        console.log(`🔗 API: http://${host}:${port}/api/v1`);
        
        if (config.tracking.enableRealTimeUpdates) {
          console.log(`🔄 WebSocket: ws://${host}:${port}`);
        }
        
        console.log(`🏷️  Environment: ${config.server.environment}`);
        console.log(`📅 Started: ${new Date().toISOString()}\n`);

        // Log configuration summary
        this.logConfigurationSummary();
      });

      // Handle server errors
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${port} is already in use`);
        } else {
          console.error('❌ Server error:', error);
        }
        process.exit(1);
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Log configuration summary
   */
  logConfigurationSummary() {
    console.log('📋 Configuration Summary:');
    console.log(`   Database: ${config.database.connectString}`);
    console.log(`   Redis: ${config.redis.host}:${config.redis.port}`);
    console.log(`   Real-time: ${config.tracking.enableRealTimeUpdates ? 'Enabled' : 'Disabled'}`);
    console.log(`   Rate Limiting: ${config.security.rateLimitEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`   IATA OneRecord: ${config.externalApis.iataOneRecord.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`   Email Notifications: ${config.notifications.email.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`   Security Headers: ${config.security.helmetEnabled ? 'Enabled' : 'Disabled'}`);
    console.log('');
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('\n🛑 Shutting down server gracefully...');

    try {
      // Close real-time service
      if (this.realTimeService) {
        console.log('🔄 Closing real-time tracking service...');
        await this.realTimeService.close();
      }

      // Close HTTP server
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      console.log('✅ HTTP server closed');

      // Close database connections
      console.log('📊 Closing database connections...');
      await database.close();
      console.log('✅ Database connections closed');

      console.log('✅ Server shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start server
const server = new Server();

// Handle process signals for graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📨 Received SIGTERM signal');
  server.shutdown();
});

process.on('SIGINT', () => {
  console.log('\n📨 Received SIGINT signal (Ctrl+C)');
  server.shutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  server.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  server.shutdown();
});

// Start the server
server.start().catch((error) => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});

module.exports = server;