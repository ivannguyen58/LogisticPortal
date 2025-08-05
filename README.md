# Customer Online Portal - Tracking Module

ALSC Logistics Customer Online Portal with comprehensive shipment tracking capabilities.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **Oracle Database** 19c or PostgreSQL 15+
- **Redis** 7.0+
- **Docker** (optional)

### 1. Environment Setup

Create `.env` file in backend directory:

```bash
# Database Configuration
DB_USER=portal_user
DB_PASSWORD=portal_password
DB_CONNECT_STRING=localhost:1521/XE

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# API Configuration
PORT=3000
NODE_ENV=development

# External APIs
IATA_ONERECORD_URL=https://onerecord.iata.org/api/v1
IATA_ONERECORD_API_KEY=your-iata-api-key
IATA_ONERECORD_ENABLED=false

# Tracking Configuration
TRACKING_UPDATE_INTERVAL=30
TRACKING_REALTIME=true
```

### 2. Database Setup

```bash
# Navigate to project directory
cd /var/www/html/CustomerOnlinePortal

# Run database migration
sqlplus portal_user/portal_password@localhost:1521/XE @src/database/migrations/001_create_tracking_tables.sql
```

### 3. Backend Installation & Start

```bash
# Navigate to backend
cd src/backend

# Install dependencies
npm install

# Start development server
npm run dev

# Or production
npm start
```

Backend will start on `http://localhost:3000`

### 4. Frontend Installation & Start

```bash
# Navigate to frontend
cd src/frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend will start on `http://localhost:3001`

## 📋 API Endpoints

### Public Tracking
```bash
# Track by AWB number (public)
GET /api/v1/tracking/awb/125-12345678

# Health check
GET /api/v1/tracking/health
```

### Authenticated Endpoints
```bash
# Get tracking by shipment ID
GET /api/v1/tracking/shipments/{shipmentId}
Authorization: Bearer {jwt_token}

# Get customer tracking history
GET /api/v1/tracking/customer/{customerId}/history
Authorization: Bearer {jwt_token}

# Create tracking event (employee/admin)
POST /api/v1/tracking/events
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "shipment_id": "uuid",
  "event_code": "FLIGHT_DEPARTED",
  "event_description": "Flight departed from SIN",
  "event_location": "Singapore Changi Airport",
  "event_datetime": "2025-08-05T10:30:00Z"
}

# Subscribe to notifications
POST /api/v1/tracking/subscribe
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "shipment_id": "uuid",
  "notification_method": "EMAIL",
  "notification_endpoint": "customer@email.com",
  "milestone_notifications": true,
  "exception_notifications": true
}
```

## 🧪 Testing

### Test Sample AWB Numbers
- `125-12345678` (Standard shipment)
- `618-87654321` (With exceptions)
- `777-11223344` (Delivered)

### API Testing with cURL

```bash
# Test public tracking
curl "http://localhost:3000/api/v1/tracking/awb/125-12345678"

# Test health check
curl "http://localhost:3000/api/v1/tracking/health"

# Test authenticated endpoint (need JWT token)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "http://localhost:3000/api/v1/tracking/shipments/shipment-id"
```

## 🔄 Real-time Tracking

### WebSocket Connection

```javascript
import realTimeTrackingService from './src/frontend/services/realTimeTrackingService';

// Connect to tracking service
await realTimeTrackingService.connect('ws://localhost:3000');

// Authenticate
realTimeTrackingService.authenticate({
  token: 'your-jwt-token',
  userId: 'user-id',
  customerId: 'customer-id'
});

// Subscribe to shipment updates
realTimeTrackingService.subscribeToShipment('shipment-id');

// Listen for events
realTimeTrackingService.on('tracking:event', (data) => {
  console.log('New tracking event:', data);
});

realTimeTrackingService.on('tracking:critical', (data) => {
  console.log('Critical update:', data);
  // Show notification
});
```

## 🗄️ Database Schema

### Key Tables
- **shipments** - Core shipment data
- **tracking_events** - All tracking events
- **shipment_milestones** - Predefined checkpoints
- **tracking_subscriptions** - Notification preferences
- **airlines** - Airline information
- **tracking_sources** - Data source configuration

### Sample Data Queries

```sql
-- Get all tracking events for a shipment
SELECT te.*, sm.milestone_name, ts.source_name
FROM tracking_events te
LEFT JOIN shipment_milestones sm ON te.milestone_id = sm.milestone_id
LEFT JOIN tracking_sources ts ON te.source_id = ts.source_id
WHERE te.shipment_id = 'your-shipment-id'
ORDER BY te.event_datetime DESC;

-- Get shipment summary
SELECT * FROM v_shipment_tracking_summary 
WHERE awb_number = '125-12345678';
```

## 🐳 Docker Deployment

### Development with Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  oracle:
    image: container-registry.oracle.com/database/express:21.3.0-xe
    environment:
      ORACLE_PWD: oracle_password
    ports:
      - "1521:1521"
    volumes:
      - oracle_data:/opt/oracle/oradata

  redis:
    image: redis:7.0-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./src/backend
    environment:
      - DB_CONNECT_STRING=oracle:1521/XE
      - REDIS_HOST=redis
    ports:
      - "3000:3000"
    depends_on:
      - oracle
      - redis

  frontend:
    build: ./src/frontend
    ports:
      - "3001:3000"
    depends_on:
      - backend

volumes:
  oracle_data:
```

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

## 🔧 Configuration

### Backend Configuration

Located in `src/backend/config/config.js`:

```javascript
module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  database: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
    poolMin: 2,
    poolMax: 20
  },
  tracking: {
    defaultUpdateInterval: 30, // minutes
    enableRealTimeUpdates: true,
    maxEventsPerRequest: 100
  }
};
```

### Frontend Configuration

Located in `src/frontend/.env`:

```bash
REACT_APP_API_URL=http://localhost:3000/api/v1
REACT_APP_TRACKING_WS_URL=ws://localhost:3000
REACT_APP_ENABLE_NOTIFICATIONS=true
```

## 📊 Monitoring & Logging

### Health Checks

```bash
# Backend health
curl http://localhost:3000/api/v1/tracking/health

# Database health
curl http://localhost:3000/api/v1/health/database

# Real-time service status
curl http://localhost:3000/api/v1/tracking/statistics
```

### Logs

```bash
# Backend logs
tail -f src/backend/logs/app.log

# Database logs (Oracle)
tail -f $ORACLE_HOME/diag/rdbms/xe/XE/trace/alert_XE.log

# System logs
journalctl -f -u customer-portal
```

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check Oracle service
   sudo systemctl status oracle-xe
   
   # Test connection
   sqlplus portal_user/portal_password@localhost:1521/XE
   ```

2. **Redis Connection Failed**
   ```bash
   # Check Redis service
   sudo systemctl status redis
   
   # Test connection
   redis-cli ping
   ```

3. **WebSocket Connection Issues**
   - Check firewall settings
   - Verify CORS configuration
   - Check JWT token validity

4. **IATA OneRecord Integration**
   ```bash
   # Test API connectivity
   curl -H "Authorization: Bearer $IATA_API_KEY" \
        https://onerecord.iata.org/api/v1/health
   ```

### Debug Mode

```bash
# Backend debug
DEBUG=tracking:* npm run dev

# Frontend debug
REACT_APP_DEBUG=true npm start
```

## 🔐 Security

### API Security
- JWT authentication required for protected endpoints
- Rate limiting (1000 requests/15 minutes)
- Input validation with Joi
- SQL injection prevention
- XSS protection

### Database Security
- Encrypted sensitive fields
- Row-level security for multi-tenant data
- Audit logging for all changes
- Connection pooling with timeout

## 📈 Performance

### Optimization Tips
- Use Oracle connection pooling
- Enable Redis caching for frequent queries
- Implement API response caching
- Use database indexes effectively
- Optimize WebSocket connections

### Monitoring Queries

```sql
-- Check connection pool usage
SELECT * FROM v$session WHERE program LIKE '%portal%';

-- Monitor slow queries
SELECT sql_text, elapsed_time, executions 
FROM v$sql 
WHERE elapsed_time > 1000000 
ORDER BY elapsed_time DESC;

-- Check tracking performance
SELECT COUNT(*) as events_today 
FROM tracking_events 
WHERE created_at >= TRUNC(SYSDATE);
```

## 📚 Documentation

- [API Documentation](docs/technical/api-specs.md)
- [Database Design](docs/technical/database-design.md)
- [Architecture Overview](docs/overview/architecture.md)
- [User Stories](docs/backlog/user-stories.md)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

- **Technical Issues**: Create GitHub issue
- **Business Questions**: Contact ALSC support team
- **Emergency**: Check health endpoints first

---

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Status**: Ready for Production