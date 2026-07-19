import pg from 'pg';
import { createClient } from 'redis';
import { config } from './config.js';
import logger from './logger.js';

const { Pool } = pg;

// PostgreSQL Connection Pool
export const dbPool = new Pool({
  connectionString: config.databaseUrl,
  max: 10, // maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

dbPool.on('connect', () => {
  logger.debug('PostgreSQL database pool connected successfully');
});

dbPool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL database client', err);
});

// Redis Connection Client
export const redisClient = createClient({
  url: config.redisUrl,
});

redisClient.on('error', (err) => {
  logger.error('Redis client error', err);
});

redisClient.on('connect', () => {
  logger.debug('Redis client connecting...');
});

redisClient.on('ready', () => {
  logger.debug('Redis client connected and ready');
});

// Helper functions for health check diagnostics
export async function checkDatabaseHealth() {
  try {
    const start = Date.now();
    const res = await dbPool.query('SELECT 1');
    return {
      status: 'UP',
      latencyMs: Date.now() - start
    };
  } catch (err) {
    logger.error('Database health check failed', err);
    return { status: 'DOWN', error: err.message };
  }
}

export async function checkRedisHealth() {
  try {
    if (!redisClient.isOpen) {
      return { status: 'DOWN', error: 'Redis client is not open' };
    }
    const start = Date.now();
    await redisClient.ping();
    return {
      status: 'UP',
      latencyMs: Date.now() - start
    };
  } catch (err) {
    logger.error('Redis health check failed', err);
    return { status: 'DOWN', error: err.message };
  }
}
