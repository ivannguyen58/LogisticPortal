-- ============================================
-- ALSC Customer Portal - Tracking Module Database Migration
-- Migration: 001_create_tracking_tables.sql
-- Description: Create core tracking tables for shipment tracking system
-- ============================================

-- Drop tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS tracking_events CASCADE;
DROP TABLE IF EXISTS tracking_subscriptions CASCADE;
DROP TABLE IF EXISTS shipment_milestones CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS tracking_sources CASCADE;
DROP TABLE IF EXISTS airlines CASCADE;

-- ============================================
-- Airlines Table
-- ============================================
CREATE TABLE airlines (
    airline_id VARCHAR2(36) PRIMARY KEY,
    iata_code VARCHAR2(2) UNIQUE NOT NULL,
    icao_code VARCHAR2(3) UNIQUE,
    airline_name VARCHAR2(200) NOT NULL,
    country VARCHAR2(2),
    status VARCHAR2(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    api_endpoint VARCHAR2(500),
    api_key VARCHAR2(1000), -- Encrypted in application
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample airlines data
INSERT INTO airlines VALUES ('airline-sq', 'SQ', 'SIA', 'Singapore Airlines', 'SG', 'ACTIVE', 'https://api.singaporeair.com/v1', NULL, SYSDATE, SYSDATE);
INSERT INTO airlines VALUES ('airline-cx', 'CX', 'CPA', 'Cathay Pacific', 'HK', 'ACTIVE', 'https://api.cathaypacific.com/v1', NULL, SYSDATE, SYSDATE);
INSERT INTO airlines VALUES ('airline-qr', 'QR', 'QTR', 'Qatar Airways', 'QA', 'ACTIVE', 'https://api.qatarairways.com/v1', NULL, SYSDATE, SYSDATE);

-- ============================================
-- Tracking Sources Table
-- ============================================
CREATE TABLE tracking_sources (
    source_id VARCHAR2(36) PRIMARY KEY,
    source_name VARCHAR2(100) NOT NULL,
    source_type VARCHAR2(50) CHECK (source_type IN ('AIRLINE', 'FORWARDER', 'CUSTOMS', 'GROUND_HANDLER', 'IATA_ONERECORD', 'MANUAL')),
    api_endpoint VARCHAR2(500),
    is_active NUMBER(1) DEFAULT 1,
    priority_level NUMBER(2) DEFAULT 5, -- 1 = highest priority
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample tracking sources
INSERT INTO tracking_sources VALUES ('src-iata', 'IATA OneRecord', 'IATA_ONERECORD', 'https://onerecord.iata.org/api/v1', 1, 1, SYSDATE, SYSDATE);
INSERT INTO tracking_sources VALUES ('src-manual', 'Manual Entry', 'MANUAL', NULL, 1, 9, SYSDATE, SYSDATE);
INSERT INTO tracking_sources VALUES ('src-customs', 'Customs System', 'CUSTOMS', 'https://customs-api.gov.sg/v1', 1, 3, SYSDATE, SYSDATE);

-- ============================================
-- Shipments Table (Core tracking entity)
-- ============================================
CREATE TABLE shipments (
    shipment_id VARCHAR2(36) PRIMARY KEY,
    awb_number VARCHAR2(50) UNIQUE NOT NULL,
    house_awb VARCHAR2(50),
    master_awb VARCHAR2(50),
    service_request_id VARCHAR2(36), -- Link to service requests
    customer_id VARCHAR2(36) NOT NULL,
    
    -- Shipment details
    shipper_name VARCHAR2(200),
    shipper_address CLOB,
    consignee_name VARCHAR2(200),
    consignee_address CLOB,
    
    -- Route information
    origin_airport VARCHAR2(3) NOT NULL,
    destination_airport VARCHAR2(3) NOT NULL,
    transit_airports VARCHAR2(100), -- Comma separated IATA codes
    
    -- Flight details
    flight_number VARCHAR2(20),
    flight_date DATE,
    airline_id VARCHAR2(36),
    
    -- Cargo details
    pieces NUMBER(6) NOT NULL CHECK (pieces > 0),
    weight_kg NUMBER(10,3) NOT NULL CHECK (weight_kg > 0),
    volume_cbm NUMBER(10,3),
    commodity_code VARCHAR2(20),
    commodity_description VARCHAR2(500),
    declared_value NUMBER(15,2),
    currency VARCHAR2(3) DEFAULT 'USD',
    
    -- Status and dates
    current_status VARCHAR2(30) DEFAULT 'CREATED' CHECK (current_status IN (
        'CREATED', 'BOOKED', 'MANIFESTED', 'DEPARTED', 'IN_TRANSIT', 
        'ARRIVED', 'CUSTOMS_CLEARANCE', 'OUT_FOR_DELIVERY', 'DELIVERED', 
        'CANCELLED', 'ON_HOLD', 'EXCEPTION'
    )),
    current_location VARCHAR2(100),
    pickup_date DATE,
    delivery_date DATE,
    estimated_delivery_date DATE,
    
    -- Tracking configuration
    tracking_enabled NUMBER(1) DEFAULT 1,
    last_tracked_at TIMESTAMP,
    tracking_frequency_minutes NUMBER(4) DEFAULT 30,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(36),
    updated_by VARCHAR2(36),
    
    -- Foreign key constraints
    FOREIGN KEY (airline_id) REFERENCES airlines(airline_id)
);

-- Create indexes for performance
CREATE INDEX idx_shipments_awb ON shipments(awb_number);
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(current_status);
CREATE INDEX idx_shipments_route ON shipments(origin_airport, destination_airport);
CREATE INDEX idx_shipments_flight ON shipments(flight_number, flight_date);
CREATE INDEX idx_shipments_dates ON shipments(pickup_date, delivery_date);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_enabled, last_tracked_at);

-- ============================================
-- Shipment Milestones (Predefined checkpoints)
-- ============================================
CREATE TABLE shipment_milestones (
    milestone_id VARCHAR2(36) PRIMARY KEY,
    milestone_code VARCHAR2(20) UNIQUE NOT NULL,
    milestone_name VARCHAR2(100) NOT NULL,
    milestone_description VARCHAR2(500),
    milestone_category VARCHAR2(50) CHECK (milestone_category IN ('PICKUP', 'DEPARTURE', 'TRANSIT', 'ARRIVAL', 'CUSTOMS', 'DELIVERY')),
    sequence_order NUMBER(3),
    is_critical NUMBER(1) DEFAULT 0, -- Critical milestones trigger alerts
    estimated_duration_hours NUMBER(5,2), -- Expected time to complete
    sla_notification_hours NUMBER(3), -- Send alert if exceeded
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Standard logistics milestones
INSERT INTO shipment_milestones VALUES ('ms-pickup', 'PICKUP_SCHEDULED', 'Pickup Scheduled', 'Shipment pickup has been scheduled', 'PICKUP', 1, 0, 2, 4, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-collected', 'CARGO_COLLECTED', 'Cargo Collected', 'Shipment collected from shipper', 'PICKUP', 2, 1, 1, 2, SYSDATE);
INSERT INTO shipments_milestones VALUES ('ms-warehouse', 'ARRIVED_WAREHOUSE', 'Arrived at Warehouse', 'Shipment arrived at origin warehouse', 'DEPARTURE', 3, 0, 4, 8, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-manifested', 'MANIFESTED', 'Manifested', 'Shipment manifested on flight', 'DEPARTURE', 4, 1, 2, 4, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-departed', 'FLIGHT_DEPARTED', 'Flight Departed', 'Flight departed from origin airport', 'DEPARTURE', 5, 1, 0, 1, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-transit', 'IN_TRANSIT', 'In Transit', 'Shipment in transit to destination', 'TRANSIT', 6, 0, 0, 2, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-arrived', 'FLIGHT_ARRIVED', 'Flight Arrived', 'Flight arrived at destination airport', 'ARRIVAL', 7, 1, 0, 1, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-customs', 'CUSTOMS_CLEARANCE', 'Customs Clearance', 'Shipment in customs clearance process', 'CUSTOMS', 8, 1, 24, 48, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-cleared', 'CUSTOMS_CLEARED', 'Customs Cleared', 'Shipment cleared customs', 'CUSTOMS', 9, 1, 4, 8, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-delivery', 'OUT_FOR_DELIVERY', 'Out for Delivery', 'Shipment out for final delivery', 'DELIVERY', 10, 0, 4, 8, SYSDATE);
INSERT INTO shipment_milestones VALUES ('ms-delivered', 'DELIVERED', 'Delivered', 'Shipment delivered to consignee', 'DELIVERY', 11, 1, 0, 0, SYSDATE);

-- ============================================
-- Tracking Events (All tracking updates)
-- ============================================
CREATE TABLE tracking_events (
    event_id VARCHAR2(36) PRIMARY KEY,
    shipment_id VARCHAR2(36) NOT NULL,
    
    -- Event details
    event_code VARCHAR2(20) NOT NULL,
    event_description VARCHAR2(500) NOT NULL,
    event_category VARCHAR2(50) CHECK (event_category IN ('STATUS_UPDATE', 'LOCATION_UPDATE', 'MILESTONE', 'EXCEPTION', 'NOTIFICATION')),
    
    -- Location and timing
    event_location VARCHAR2(100),
    event_country VARCHAR2(2),
    event_city VARCHAR2(100),
    airport_code VARCHAR2(3),
    event_datetime TIMESTAMP NOT NULL,
    event_timezone VARCHAR2(10) DEFAULT 'UTC',
    
    -- Event classification
    milestone_id VARCHAR2(36), -- Link to predefined milestone
    is_milestone NUMBER(1) DEFAULT 0,
    is_exception NUMBER(1) DEFAULT 0,
    is_critical NUMBER(1) DEFAULT 0,
    severity_level VARCHAR2(20) DEFAULT 'INFO' CHECK (severity_level IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    
    -- Data source
    source_id VARCHAR2(36),
    external_event_id VARCHAR2(100), -- ID from external system
    source_reference VARCHAR2(200), -- Additional reference from source
    
    -- Additional data
    additional_info CLOB, -- JSON formatted additional information
    longitude NUMBER(10,7),
    latitude NUMBER(10,7),
    temperature_celsius NUMBER(5,2),
    humidity_percent NUMBER(5,2),
    
    -- Processing status
    processed NUMBER(1) DEFAULT 0,
    notification_sent NUMBER(1) DEFAULT 0,
    customer_visible NUMBER(1) DEFAULT 1,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(36),
    
    -- Foreign key constraints
    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    FOREIGN KEY (milestone_id) REFERENCES shipment_milestones(milestone_id),
    FOREIGN KEY (source_id) REFERENCES tracking_sources(source_id)
);

-- Create indexes for performance
CREATE INDEX idx_tracking_events_shipment ON tracking_events(shipment_id);
CREATE INDEX idx_tracking_events_datetime ON tracking_events(event_datetime DESC);
CREATE INDEX idx_tracking_events_code ON tracking_events(event_code);
CREATE INDEX idx_tracking_events_location ON tracking_events(event_location);
CREATE INDEX idx_tracking_events_milestone ON tracking_events(milestone_id);
CREATE INDEX idx_tracking_events_processing ON tracking_events(processed, notification_sent);
CREATE INDEX idx_tracking_events_severity ON tracking_events(severity_level);

-- Composite indexes for common queries
CREATE INDEX idx_tracking_events_shipment_time ON tracking_events(shipment_id, event_datetime DESC);
CREATE INDEX idx_tracking_events_critical ON tracking_events(is_critical, is_exception, severity_level);

-- ============================================
-- Tracking Subscriptions (Customer notifications)
-- ============================================
CREATE TABLE tracking_subscriptions (
    subscription_id VARCHAR2(36) PRIMARY KEY,
    shipment_id VARCHAR2(36) NOT NULL,
    customer_id VARCHAR2(36) NOT NULL,
    user_id VARCHAR2(36), -- Specific user who subscribed
    
    -- Subscription settings
    notification_method VARCHAR2(20) DEFAULT 'EMAIL' CHECK (notification_method IN ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK')),
    notification_endpoint VARCHAR2(500), -- Email, phone, or webhook URL
    
    -- Event filters
    milestone_notifications NUMBER(1) DEFAULT 1,
    exception_notifications NUMBER(1) DEFAULT 1,
    location_updates NUMBER(1) DEFAULT 0,
    all_events NUMBER(1) DEFAULT 0,
    
    -- Status
    is_active NUMBER(1) DEFAULT 1,
    subscription_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_notification_sent TIMESTAMP,
    notification_count NUMBER(6) DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    
    -- Unique constraint - one subscription per shipment/customer/method
    UNIQUE(shipment_id, customer_id, notification_method)
);

-- Create indexes
CREATE INDEX idx_tracking_subs_shipment ON tracking_subscriptions(shipment_id);
CREATE INDEX idx_tracking_subs_customer ON tracking_subscriptions(customer_id);
CREATE INDEX idx_tracking_subs_active ON tracking_subscriptions(is_active);

-- ============================================
-- Create triggers for automatic timestamps
-- ============================================

-- Trigger for shipments updated_at
CREATE OR REPLACE TRIGGER trg_shipments_updated_at
    BEFORE UPDATE ON shipments
    FOR EACH ROW
BEGIN
    :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/

-- Trigger for airlines updated_at
CREATE OR REPLACE TRIGGER trg_airlines_updated_at
    BEFORE UPDATE ON airlines
    FOR EACH ROW
BEGIN
    :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/

-- Trigger for tracking_sources updated_at
CREATE OR REPLACE TRIGGER trg_tracking_sources_updated_at
    BEFORE UPDATE ON tracking_sources
    FOR EACH ROW
BEGIN
    :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/

-- Trigger for tracking_subscriptions updated_at
CREATE OR REPLACE TRIGGER trg_tracking_subs_updated_at
    BEFORE UPDATE ON tracking_subscriptions
    FOR EACH ROW
BEGIN
    :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/

-- ============================================
-- Create sequences for ID generation (if using numeric IDs)
-- ============================================
CREATE SEQUENCE seq_tracking_events START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_shipment_notifications START WITH 1 INCREMENT BY 1;

-- ============================================
-- Create views for common queries
-- ============================================

-- View for latest tracking events per shipment
CREATE OR REPLACE VIEW v_latest_tracking_events AS
SELECT 
    s.shipment_id,
    s.awb_number,
    s.current_status,
    s.current_location,
    te.event_id,
    te.event_description,
    te.event_location,
    te.event_datetime,
    te.is_milestone,
    te.is_exception,
    ROW_NUMBER() OVER (PARTITION BY s.shipment_id ORDER BY te.event_datetime DESC) AS rn
FROM shipments s
LEFT JOIN tracking_events te ON s.shipment_id = te.shipment_id
WHERE te.customer_visible = 1;

-- View for shipment tracking summary
CREATE OR REPLACE VIEW v_shipment_tracking_summary AS
SELECT 
    s.shipment_id,
    s.awb_number,
    s.customer_id,
    s.current_status,
    s.origin_airport,
    s.destination_airport,
    s.pickup_date,
    s.delivery_date,
    s.estimated_delivery_date,
    COUNT(te.event_id) as total_events,
    COUNT(CASE WHEN te.is_milestone = 1 THEN 1 END) as milestones_completed,
    COUNT(CASE WHEN te.is_exception = 1 THEN 1 END) as exceptions_count,
    MAX(te.event_datetime) as last_update,
    s.created_at
FROM shipments s
LEFT JOIN tracking_events te ON s.shipment_id = te.shipment_id
GROUP BY s.shipment_id, s.awb_number, s.customer_id, s.current_status, 
         s.origin_airport, s.destination_airport, s.pickup_date, 
         s.delivery_date, s.estimated_delivery_date, s.created_at;

-- ============================================
-- Grant permissions (adjust schema as needed)
-- ============================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON shipments TO portal_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tracking_events TO portal_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tracking_subscriptions TO portal_api_user;
-- GRANT SELECT ON airlines TO portal_api_user;
-- GRANT SELECT ON shipment_milestones TO portal_api_user;
-- GRANT SELECT ON tracking_sources TO portal_api_user;

COMMIT;

-- Migration completed successfully
SELECT 'Tracking module database migration completed successfully' AS status FROM dual;