const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const TrackingEvent = require('./TrackingEvent');

/**
 * Shipment Model
 * Handles all shipment-related database operations
 */
class Shipment {
  constructor(data = {}) {
    this.shipment_id = data.shipment_id || uuidv4();
    this.awb_number = data.awb_number;
    this.house_awb = data.house_awb;
    this.master_awb = data.master_awb;
    this.service_request_id = data.service_request_id;
    this.customer_id = data.customer_id;
    
    // Shipment details
    this.shipper_name = data.shipper_name;
    this.shipper_address = data.shipper_address;
    this.consignee_name = data.consignee_name;
    this.consignee_address = data.consignee_address;
    
    // Route information
    this.origin_airport = data.origin_airport;
    this.destination_airport = data.destination_airport;
    this.transit_airports = data.transit_airports;
    
    // Flight details
    this.flight_number = data.flight_number;
    this.flight_date = data.flight_date;
    this.airline_id = data.airline_id;
    
    // Cargo details
    this.pieces = data.pieces;
    this.weight_kg = data.weight_kg;
    this.volume_cbm = data.volume_cbm;
    this.commodity_code = data.commodity_code;
    this.commodity_description = data.commodity_description;
    this.declared_value = data.declared_value;
    this.currency = data.currency || 'USD';
    
    // Status and dates
    this.current_status = data.current_status || 'CREATED';
    this.current_location = data.current_location;
    this.pickup_date = data.pickup_date;
    this.delivery_date = data.delivery_date;
    this.estimated_delivery_date = data.estimated_delivery_date;
    
    // Tracking configuration
    this.tracking_enabled = data.tracking_enabled !== undefined ? data.tracking_enabled : 1;
    this.last_tracked_at = data.last_tracked_at;
    this.tracking_frequency_minutes = data.tracking_frequency_minutes || 30;
    
    // Audit fields
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
  }

  /**
   * Create a new shipment
   */
  async create() {
    try {
      const query = `
        INSERT INTO shipments (
          shipment_id, awb_number, house_awb, master_awb, service_request_id, customer_id,
          shipper_name, shipper_address, consignee_name, consignee_address,
          origin_airport, destination_airport, transit_airports,
          flight_number, flight_date, airline_id,
          pieces, weight_kg, volume_cbm, commodity_code, commodity_description,
          declared_value, currency, current_status, current_location,
          pickup_date, delivery_date, estimated_delivery_date,
          tracking_enabled, tracking_frequency_minutes, created_by
        ) VALUES (
          :shipment_id, :awb_number, :house_awb, :master_awb, :service_request_id, :customer_id,
          :shipper_name, :shipper_address, :consignee_name, :consignee_address,
          :origin_airport, :destination_airport, :transit_airports,
          :flight_number, :flight_date, :airline_id,
          :pieces, :weight_kg, :volume_cbm, :commodity_code, :commodity_description,
          :declared_value, :currency, :current_status, :current_location,
          :pickup_date, :delivery_date, :estimated_delivery_date,
          :tracking_enabled, :tracking_frequency_minutes, :created_by
        )
      `;

      const result = await db.execute(query, this);
      await db.commit();
      
      // Create initial tracking event
      await this.createInitialTrackingEvent();
      
      return this;
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to create shipment: ${error.message}`);
    }
  }

  /**
   * Find shipment by ID
   */
  static async findById(shipmentId) {
    try {
      const query = `
        SELECT s.*, a.airline_name, a.iata_code as airline_code
        FROM shipments s
        LEFT JOIN airlines a ON s.airline_id = a.airline_id
        WHERE s.shipment_id = :shipmentId
      `;
      
      const result = await db.execute(query, { shipmentId });
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Shipment(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to find shipment: ${error.message}`);
    }
  }

  /**
   * Find shipment by AWB number
   */
  static async findByAwb(awbNumber) {
    try {
      const query = `
        SELECT s.*, a.airline_name, a.iata_code as airline_code
        FROM shipments s
        LEFT JOIN airlines a ON s.airline_id = a.airline_id
        WHERE s.awb_number = :awbNumber
      `;
      
      const result = await db.execute(query, { awbNumber });
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Shipment(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to find shipment by AWB: ${error.message}`);
    }
  }

  /**
   * Find shipments by customer ID
   */
  static async findByCustomer(customerId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        status = null,
        dateFrom = null,
        dateTo = null,
        orderBy = 'created_at',
        orderDirection = 'DESC'
      } = options;

      let whereConditions = ['s.customer_id = :customerId'];
      const queryParams = { customerId };

      if (status) {
        whereConditions.push('s.current_status = :status');
        queryParams.status = status;
      }

      if (dateFrom) {
        whereConditions.push('s.created_at >= :dateFrom');
        queryParams.dateFrom = dateFrom;
      }

      if (dateTo) {
        whereConditions.push('s.created_at <= :dateTo');
        queryParams.dateTo = dateTo;
      }

      const query = `
        SELECT s.*, a.airline_name, a.iata_code as airline_code,
               COUNT(*) OVER() as total_count
        FROM shipments s
        LEFT JOIN airlines a ON s.airline_id = a.airline_id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY s.${orderBy} ${orderDirection}
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      queryParams.limit = limit;
      queryParams.offset = offset;

      const result = await db.execute(query, queryParams);
      
      return {
        shipments: result.rows.map(row => new Shipment(row)),
        totalCount: result.rows.length > 0 ? result.rows[0].total_count : 0
      };
    } catch (error) {
      throw new Error(`Failed to find shipments by customer: ${error.message}`);
    }
  }

  /**
   * Update shipment status and location
   */
  async updateStatus(status, location = null, updatedBy = null) {
    try {
      const query = `
        UPDATE shipments 
        SET current_status = :status,
            current_location = :location,
            updated_by = :updatedBy,
            updated_at = CURRENT_TIMESTAMP
        WHERE shipment_id = :shipment_id
      `;

      await db.execute(query, {
        status,
        location,
        updatedBy,
        shipment_id: this.shipment_id
      });
      
      await db.commit();
      
      // Update instance properties
      this.current_status = status;
      this.current_location = location;
      this.updated_by = updatedBy;
      
      return this;
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to update shipment status: ${error.message}`);
    }
  }

  /**
   * Update tracking configuration
   */
  async updateTrackingConfig(config) {
    try {
      const {
        tracking_enabled,
        tracking_frequency_minutes
      } = config;

      const query = `
        UPDATE shipments 
        SET tracking_enabled = :tracking_enabled,
            tracking_frequency_minutes = :tracking_frequency_minutes,
            updated_at = CURRENT_TIMESTAMP
        WHERE shipment_id = :shipment_id
      `;

      await db.execute(query, {
        tracking_enabled,
        tracking_frequency_minutes,
        shipment_id: this.shipment_id
      });
      
      await db.commit();
      
      // Update instance properties
      this.tracking_enabled = tracking_enabled;
      this.tracking_frequency_minutes = tracking_frequency_minutes;
      
      return this;
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to update tracking config: ${error.message}`);
    }
  }

  /**
   * Get shipment tracking history
   */
  async getTrackingHistory(options = {}) {
    try {
      const {
        limit = 100,
        includeInternal = false,
        eventTypes = null
      } = options;

      let whereConditions = ['te.shipment_id = :shipment_id'];
      const queryParams = { shipment_id: this.shipment_id };

      if (!includeInternal) {
        whereConditions.push('te.customer_visible = 1');
      }

      if (eventTypes && eventTypes.length > 0) {
        whereConditions.push(`te.event_category IN (${eventTypes.map((_, i) => `:eventType${i}`).join(', ')})`);
        eventTypes.forEach((type, i) => {
          queryParams[`eventType${i}`] = type;
        });
      }

      const query = `
        SELECT te.*, sm.milestone_name, sm.milestone_category, ts.source_name
        FROM tracking_events te
        LEFT JOIN shipment_milestones sm ON te.milestone_id = sm.milestone_id
        LEFT JOIN tracking_sources ts ON te.source_id = ts.source_id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY te.event_datetime DESC
        FETCH FIRST :limit ROWS ONLY
      `;

      queryParams.limit = limit;

      const result = await db.execute(query, queryParams);
      
      return result.rows.map(row => new TrackingEvent(row));
    } catch (error) {
      throw new Error(`Failed to get tracking history: ${error.message}`);
    }
  }

  /**
   * Get latest tracking event
   */
  async getLatestTrackingEvent() {
    try {
      const events = await this.getTrackingHistory({ limit: 1 });
      return events.length > 0 ? events[0] : null;
    } catch (error) {
      throw new Error(`Failed to get latest tracking event: ${error.message}`);
    }
  }

  /**
   * Create initial tracking event when shipment is created
   */
  async createInitialTrackingEvent() {
    try {
      const initialEvent = new TrackingEvent({
        shipment_id: this.shipment_id,
        event_code: 'SHIPMENT_CREATED',
        event_description: 'Shipment record created in system',
        event_category: 'STATUS_UPDATE',
        event_location: this.origin_airport,
        event_datetime: new Date(),
        is_milestone: 1,
        severity_level: 'INFO',
        customer_visible: 1,
        created_by: this.created_by
      });

      await initialEvent.create();
      return initialEvent;
    } catch (error) {
      throw new Error(`Failed to create initial tracking event: ${error.message}`);
    }
  }

  /**
   * Check if shipment is delivered
   */
  isDelivered() {
    return this.current_status === 'DELIVERED';
  }

  /**
   * Check if shipment is in transit
   */
  isInTransit() {
    return ['DEPARTED', 'IN_TRANSIT', 'ARRIVED'].includes(this.current_status);
  }

  /**
   * Check if shipment has exceptions
   */
  async hasExceptions() {
    try {
      const query = `
        SELECT COUNT(*) as exception_count
        FROM tracking_events
        WHERE shipment_id = :shipment_id AND is_exception = 1
      `;

      const result = await db.execute(query, { shipment_id: this.shipment_id });
      return result.rows[0].exception_count > 0;
    } catch (error) {
      throw new Error(`Failed to check exceptions: ${error.message}`);
    }
  }

  /**
   * Calculate estimated delivery time based on route and historical data
   */
  async calculateEstimatedDelivery() {
    try {
      // This is a simplified calculation - in reality, you'd use ML or historical data
      const query = `
        SELECT AVG(
          EXTRACT(DAY FROM (delivery_date - pickup_date)) * 24 + 
          EXTRACT(HOUR FROM (delivery_date - pickup_date))
        ) as avg_delivery_hours
        FROM shipments
        WHERE origin_airport = :origin_airport 
        AND destination_airport = :destination_airport
        AND delivery_date IS NOT NULL
        AND pickup_date IS NOT NULL
        AND current_status = 'DELIVERED'
        AND ROWNUM <= 100
      `;

      const result = await db.execute(query, {
        origin_airport: this.origin_airport,
        destination_airport: this.destination_airport
      });

      const avgHours = result.rows[0]?.avg_delivery_hours || 72; // Default 3 days
      
      if (this.pickup_date) {
        const estimatedDelivery = new Date(this.pickup_date);
        estimatedDelivery.setHours(estimatedDelivery.getHours() + avgHours);
        return estimatedDelivery;
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to calculate estimated delivery: ${error.message}`);
    }
  }

  /**
   * Get shipment tracking summary
   */
  async getTrackingSummary() {
    try {
      const query = `
        SELECT 
          COUNT(te.event_id) as total_events,
          COUNT(CASE WHEN te.is_milestone = 1 THEN 1 END) as milestones_completed,
          COUNT(CASE WHEN te.is_exception = 1 THEN 1 END) as exceptions_count,
          MAX(te.event_datetime) as last_update,
          MIN(te.event_datetime) as first_update
        FROM tracking_events te
        WHERE te.shipment_id = :shipment_id
        AND te.customer_visible = 1
      `;

      const result = await db.execute(query, { shipment_id: this.shipment_id });
      
      return {
        shipment_id: this.shipment_id,
        awb_number: this.awb_number,
        current_status: this.current_status,
        current_location: this.current_location,
        origin_airport: this.origin_airport,
        destination_airport: this.destination_airport,
        estimated_delivery_date: this.estimated_delivery_date,
        ...result.rows[0]
      };
    } catch (error) {
      throw new Error(`Failed to get tracking summary: ${error.message}`);
    }
  }

  /**
   * Delete shipment (soft delete by setting status)
   */
  async delete(deletedBy = null) {
    try {
      const query = `
        UPDATE shipments 
        SET current_status = 'CANCELLED',
            updated_by = :deletedBy,
            updated_at = CURRENT_TIMESTAMP
        WHERE shipment_id = :shipment_id
      `;

      await db.execute(query, {
        deletedBy,
        shipment_id: this.shipment_id
      });
      
      await db.commit();
      
      this.current_status = 'CANCELLED';
      this.updated_by = deletedBy;
      
      return this;
    } catch (error) {
      await db.rollback();
      throw new Error(`Failed to delete shipment: ${error.message}`);
    }
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      shipment_id: this.shipment_id,
      awb_number: this.awb_number,
      house_awb: this.house_awb,
      master_awb: this.master_awb,
      service_request_id: this.service_request_id,
      customer_id: this.customer_id,
      shipper_name: this.shipper_name,
      shipper_address: this.shipper_address,
      consignee_name: this.consignee_name,
      consignee_address: this.consignee_address,
      origin_airport: this.origin_airport,
      destination_airport: this.destination_airport,
      transit_airports: this.transit_airports,
      flight_number: this.flight_number,
      flight_date: this.flight_date,
      airline_id: this.airline_id,
      pieces: this.pieces,
      weight_kg: this.weight_kg,
      volume_cbm: this.volume_cbm,
      commodity_code: this.commodity_code,
      commodity_description: this.commodity_description,
      declared_value: this.declared_value,
      currency: this.currency,
      current_status: this.current_status,
      current_location: this.current_location,
      pickup_date: this.pickup_date,
      delivery_date: this.delivery_date,
      estimated_delivery_date: this.estimated_delivery_date,
      tracking_enabled: this.tracking_enabled,
      last_tracked_at: this.last_tracked_at,
      tracking_frequency_minutes: this.tracking_frequency_minutes,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = Shipment;