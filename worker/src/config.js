import dotenv from 'dotenv';

// Load .env in local development
dotenv.config();

const requiredEnv = ['DATABASE_URL', 'REDIS_URL'];
const missingEnv = requiredEnv.filter((env) => !process.env[env]);

if (missingEnv.length > 0) {
  console.error(`CRITICAL CONFIG ERROR (Worker): Missing environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  healthcheckPort: parseInt(process.env.HEALTHCHECK_PORT || '5001', 10),
};
