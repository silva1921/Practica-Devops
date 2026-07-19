import pg from 'pg';
import { createClient } from 'redis';
import { config } from './config.js';
import logger from './logger.js';

const { Pool } = pg;

export const dbPool = new Pool({
  connectionString: config.databaseUrl,
  max: 5, // smaller pool for worker
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

dbPool.on('connect', () => {
  logger.debug('PostgreSQL database pool connected (Worker)');
});

dbPool.on('error', (err) => {
  logger.error('Unexpected database client error in Worker pool', err);
});

export const redisClient = createClient({
  url: config.redisUrl,
});

redisClient.on('error', (err) => {
  logger.error('Redis client error in Worker', err);
});

export async function checkDatabaseHealth() {
  try {
    await dbPool.query('SELECT 1');
    return { status: 'UP' };
  } catch (err) {
    return { status: 'DOWN', error: err.message };
  }
}

export async function checkRedisHealth() {
  try {
    if (!redisClient.isOpen) {
      return { status: 'DOWN', error: 'Redis client is not open' };
    }
    await redisClient.ping();
    return { status: 'UP' };
  } catch (err) {
    return { status: 'DOWN', error: err.message };
  }
}
