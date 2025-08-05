const oracledb = require('oracledb');
const config = require('./config');

// Configure Oracle connection
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false; // Manual transaction control

class Database {
  constructor() {
    this.pool = null;
    this.connection = null;
  }

  /**
   * Initialize database connection pool
   */
  async initialize() {
    try {
      this.pool = await oracledb.createPool({
        user: config.database.user,
        password: config.database.password,
        connectString: config.database.connectString,
        poolMin: config.database.poolMin || 2,
        poolMax: config.database.poolMax || 20,
        poolIncrement: config.database.poolIncrement || 2,
        poolTimeout: config.database.poolTimeout || 300,
        stmtCacheSize: config.database.stmtCacheSize || 30,
        edition: config.database.edition,
        events: config.database.events || false,
        externalAuth: config.database.externalAuth || false,
        homogeneous: config.database.homogeneous || true,
        queueTimeout: config.database.queueTimeout || 60000
      });

      console.log('Database connection pool created successfully');
      console.log(`Pool connections: ${this.pool.connectionsOpen}/${this.pool.poolMax}`);
      
      // Test connection
      await this.testConnection();
      
    } catch (error) {
      console.error('Failed to create database connection pool:', error);
      throw error;
    }
  }

  /**
   * Test database connection
   */
  async testConnection() {
    let connection;
    try {
      connection = await this.pool.getConnection();
      const result = await connection.execute('SELECT 1 as test FROM dual');
      console.log('Database connection test successful:', result.rows[0]);
    } catch (error) {
      console.error('Database connection test failed:', error);
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing test connection:', err);
        }
      }
    }
  }

  /**
   * Get connection from pool
   */
  async getConnection() {
    try {
      if (!this.pool) {
        throw new Error('Database pool not initialized');
      }
      return await this.pool.getConnection();
    } catch (error) {
      console.error('Failed to get database connection:', error);
      throw error;
    }
  }

  /**
   * Execute SQL query with parameters
   */
  async execute(sql, params = {}, options = {}) {
    let connection;
    try {
      connection = await this.getConnection();
      
      const defaultOptions = {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false,
        ...options
      };

      const result = await connection.execute(sql, params, defaultOptions);
      return result;
    } catch (error) {
      console.error('Database execution error:', {
        sql: sql.substring(0, 200) + '...',
        params: JSON.stringify(params),
        error: error.message
      });
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Execute SQL query with transaction support
   */
  async executeWithTransaction(queries) {
    let connection;
    try {
      connection = await this.getConnection();
      
      const results = [];
      
      for (const query of queries) {
        const { sql, params = {}, options = {} } = query;
        const defaultOptions = {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: false,
          ...options
        };
        
        const result = await connection.execute(sql, params, defaultOptions);
        results.push(result);
      }
      
      await connection.commit();
      return results;
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error('Rollback error:', rollbackError);
        }
      }
      console.error('Transaction execution error:', error);
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Execute query with pagination
   */
  async executeWithPagination(sql, params = {}, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;
      
      // Add pagination to SQL
      const paginatedSql = `
        SELECT * FROM (
          SELECT a.*, ROWNUM rnum FROM (
            ${sql}
          ) a WHERE ROWNUM <= :maxRow
        ) WHERE rnum > :minRow
      `;
      
      const paginatedParams = {
        ...params,
        minRow: offset,
        maxRow: offset + limit
      };
      
      // Get total count
      const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
      const countResult = await this.execute(countSql, params);
      const total = countResult.rows[0].total;
      
      // Get paginated results
      const result = await this.execute(paginatedSql, paginatedParams);
      
      return {
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('Pagination query error:', error);
      throw error;
    }
  }

  /**
   * Manual commit
   */
  async commit() {
    // This is handled at connection level in execute methods
    // This method is for compatibility with model classes
    return true;
  }

  /**
   * Manual rollback
   */
  async rollback() {
    // This is handled at connection level in execute methods
    // This method is for compatibility with model classes
    return true;
  }

  /**
   * Close database pool
   */
  async close() {
    try {
      if (this.pool) {
        await this.pool.close(10);
        this.pool = null;
        console.log('Database connection pool closed');
      }
    } catch (error) {
      console.error('Error closing database pool:', error);
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }
    
    return {
      connectionsOpen: this.pool.connectionsOpen,
      connectionsInUse: this.pool.connectionsInUse,
      poolMin: this.pool.poolMin,
      poolMax: this.pool.poolMax,
      poolIncrement: this.pool.poolIncrement,
      queueLength: this.pool.queueLength,
      queueTimeout: this.pool.queueTimeout
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const result = await this.execute('SELECT SYSDATE as current_time FROM dual');
      const stats = this.getPoolStats();
      
      return {
        status: 'healthy',
        timestamp: result.rows[0].current_time,
        pool: stats
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        pool: this.getPoolStats()
      };
    }
  }
}

// Create singleton instance
const database = new Database();

module.exports = database;