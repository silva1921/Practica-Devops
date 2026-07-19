import dotenv from 'dotenv';
import path from 'path';

// Load .env in local development
dotenv.config();

const requiredEnv = ['DATABASE_URL', 'REDIS_URL'];
const missingEnv = requiredEnv.filter((env) => !process.env[env]);

if (missingEnv.length > 0) {
  console.error(`CRITICAL CONFIG ERROR: Missing environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
};
