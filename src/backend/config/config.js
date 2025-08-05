require('dotenv').config();

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // Database configuration
  database: {
    user: process.env.DB_USER || 'portal_user',
    password: process.env.DB_PASSWORD || 'portal_password',
    connectString: process.env.DB_CONNECT_STRING || 'localhost:1521/XE',
    poolMin: parseInt(process.env.DB_POOL_MIN) || 2,
    poolMax: parseInt(process.env.DB_POOL_MAX) || 20,
    poolIncrement: parseInt(process.env.DB_POOL_INCREMENT) || 2,
    poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT) || 300,
    stmtCacheSize: parseInt(process.env.DB_STMT_CACHE_SIZE) || 30,
    queueTimeout: parseInt(process.env.DB_QUEUE_TIMEOUT) || 60000
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'portal:',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'alsc-portal',
    audience: process.env.JWT_AUDIENCE || 'portal-api'
  },

  // API configuration
  api: {
    version: 'v1',
    prefix: '/api/v1',
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX) || 1000 // requests per window
    }
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    optionsSuccessStatus: 200
  },

  // Tracking configuration
  tracking: {
    defaultUpdateInterval: parseInt(process.env.TRACKING_UPDATE_INTERVAL) || 30, // minutes
    maxEventsPerRequest: parseInt(process.env.TRACKING_MAX_EVENTS) || 100,
    enableRealTimeUpdates: process.env.TRACKING_REALTIME === 'true',
    notificationRetryAttempts: parseInt(process.env.TRACKING_NOTIFICATION_RETRIES) || 3
  },

  // External API configurations
  externalApis: {
    iataOneRecord: {
      baseUrl: process.env.IATA_ONERECORD_URL || 'https://onerecord.iata.org/api/v1',
      apiKey: process.env.IATA_ONERECORD_API_KEY || null,
      timeout: parseInt(process.env.IATA_ONERECORD_TIMEOUT) || 30000,
      enabled: process.env.IATA_ONERECORD_ENABLED === 'true'
    },
    customsApi: {
      baseUrl: process.env.CUSTOMS_API_URL || 'https://customs-api.gov.sg/v1',
      apiKey: process.env.CUSTOMS_API_KEY || null,
      timeout: parseInt(process.env.CUSTOMS_API_TIMEOUT) || 30000,
      enabled: process.env.CUSTOMS_API_ENABLED === 'true'
    },
    odooApi: {
      baseUrl: process.env.ODOO_API_URL || 'https://odoo.alsc.com/api/v1',
      database: process.env.ODOO_DATABASE || 'alsc_production',
      username: process.env.ODOO_USERNAME || 'portal_integration',
      password: process.env.ODOO_PASSWORD || null,
      timeout: parseInt(process.env.ODOO_API_TIMEOUT) || 30000,
      enabled: process.env.ODOO_API_ENABLED === 'true'
    }
  },

  // Notification configuration
  notifications: {
    email: {
      enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
      provider: process.env.EMAIL_PROVIDER || 'smtp',
      smtp: {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || null,
          pass: process.env.SMTP_PASSWORD || null
        }
      },
      from: process.env.EMAIL_FROM || 'noreply@alsc.com',
      templates: {
        trackingUpdate: 'tracking-update',
        exception: 'tracking-exception',
        delivered: 'shipment-delivered'
      }
    },
    sms: {
      enabled: process.env.SMS_NOTIFICATIONS_ENABLED === 'true',
      provider: process.env.SMS_PROVIDER || 'twilio',
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || null,
        authToken: process.env.TWILIO_AUTH_TOKEN || null,
        from: process.env.TWILIO_FROM_NUMBER || null
      }
    },
    push: {
      enabled: process.env.PUSH_NOTIFICATIONS_ENABLED === 'true',
      firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID || null,
        privateKey: process.env.FIREBASE_PRIVATE_KEY || null,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || null
      }
    }
  },

  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedTypes: process.env.UPLOAD_ALLOWED_TYPES ? 
      process.env.UPLOAD_ALLOWED_TYPES.split(',') : 
      ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'],
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    s3: {
      enabled: process.env.AWS_S3_ENABLED === 'true',
      bucket: process.env.AWS_S3_BUCKET || null,
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined',
    file: {
      enabled: process.env.LOG_FILE_ENABLED === 'true',
      filename: process.env.LOG_FILENAME || 'app.log',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
    },
    database: {
      enabled: process.env.LOG_DATABASE_ENABLED === 'true',
      level: process.env.LOG_DATABASE_LEVEL || 'error'
    }
  },

  // Security configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    sessionSecret: process.env.SESSION_SECRET || 'your-super-secret-session-key',
    csrfEnabled: process.env.CSRF_ENABLED === 'true',
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false'
  },

  // Monitoring configuration
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    metricsPath: process.env.MONITORING_METRICS_PATH || '/metrics',
    healthCheckPath: process.env.MONITORING_HEALTH_PATH || '/health'
  },

  // Queue configuration
  queue: {
    redis: {
      host: process.env.QUEUE_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.QUEUE_REDIS_PORT) || parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.QUEUE_REDIS_PASSWORD || process.env.REDIS_PASSWORD || null,
      db: parseInt(process.env.QUEUE_REDIS_DB) || 1
    },
    defaultJobOptions: {
      removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE) || 100,
      removeOnFail: parseInt(process.env.QUEUE_REMOVE_ON_FAIL) || 50,
      attempts: parseInt(process.env.QUEUE_ATTEMPTS) || 3,
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.QUEUE_BACKOFF_DELAY) || 2000
      }
    }
  }
};

// Validate required configuration
const requiredConfig = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_CONNECT_STRING',
  'JWT_SECRET'
];

const missingConfig = requiredConfig.filter(key => !process.env[key]);

if (missingConfig.length > 0 && process.env.NODE_ENV === 'production') {
  console.error('Missing required environment variables:', missingConfig);
  process.exit(1);
}

module.exports = config;