import http from 'http';
import { config } from './config.js';
import logger from './logger.js';
import {
  dbPool,
  redisClient,
  checkDatabaseHealth,
  checkRedisHealth
} from './database.js';

import { validateAndAnalyzeSubmission } from './validator.js';

let isShuttingDown = false;
let currentTaskPromise = null;

// 1. Core Worker validation and processing
async function processSubmission(submissionId, formId) {
  logger.info('Processing submission started', { submissionId, formId });

  // Update submission status to PROCESSING
  await dbPool.query(
    'UPDATE submissions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    ['PROCESSING', submissionId]
  );

  // Simulate heavy processing/analytics (e.g., 2.5 seconds)
  await new Promise((resolve) => setTimeout(resolve, 2500));

  // Retrieve form and submission records
  const formQuery = await dbPool.query('SELECT * FROM forms WHERE id = $1', [formId]);
  const submissionQuery = await dbPool.query('SELECT * FROM submissions WHERE id = $1', [submissionId]);

  if (formQuery.rows.length === 0 || submissionQuery.rows.length === 0) {
    const errorMsg = `Missing form (${formId}) or submission (${submissionId}) in database.`;
    logger.error(errorMsg);
    await dbPool.query(
      "UPDATE submissions SET status = 'FAILED', error = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [errorMsg, submissionId]
    );
    return;
  }

  const fields = form.fields;
  const answers = submission.answers;

  // Delegate to the pure validation/analytics function (also unit-tested)
  const { validationErrors, analysisReport } = validateAndAnalyzeSubmission(fields, answers);

  if (validationErrors.length > 0) {
    // If validation failed, mark status as FAILED and record error list
    logger.warn('Submission validation failed', { submissionId, validationErrors });
    await dbPool.query(
      "UPDATE submissions SET status = 'FAILED', error = $1, analysis = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
      [validationErrors.join(' | '), JSON.stringify(analysisReport), submissionId]
    );
  } else {
    // If validation succeeded, mark as PROCESSED
    logger.info('Submission validation passed and analyzed', { submissionId });
    await dbPool.query(
      "UPDATE submissions SET status = 'PROCESSED', error = NULL, analysis = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [JSON.stringify(analysisReport), submissionId]
    );
  }
}

// 2. Worker Queue Listening Loop
async function startWorkerLoop() {
  logger.info('Worker loop initialized. Awaiting submissions...');

  while (!isShuttingDown) {
    try {
      if (!redisClient.isOpen) {
        logger.warn('Redis client not open, waiting 2 seconds before retry...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      const response = await redisClient.blPop('submissions_queue', 5);

      if (response) {
        const { key, element } = response;
        const { submissionId, formId } = JSON.parse(element);

        currentTaskPromise = processSubmission(submissionId, formId);
        await currentTaskPromise;
        currentTaskPromise = null;
      }
    } catch (err) {
      logger.error('Error encountered in worker loop', err);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  logger.info('Worker loop stopped.');
}

// 3. Health check HTTP Server
const healthServer = http.createServer(async (req, res) => {
  const url = req.url;

  if (url === '/live') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'UP', service: 'worker' }));
    return;
  }

  if (url === '/ready' || url === '/health') {
    const dbHealth = await checkDatabaseHealth();
    const redisHealth = await checkRedisHealth();
    const isHealthy = dbHealth.status === 'UP' && redisHealth.status === 'UP';

    res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isHealthy ? 'UP' : 'DOWN',
      db: dbHealth.status,
      redis: redisHealth.status,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// Start Worker Service
async function startWorker() {
  try {
    await redisClient.connect();
    logger.info('Redis connection initialized (Worker)');

    healthServer.listen(config.healthcheckPort, '0.0.0.0', () => {
      logger.info(`Worker health server running on port ${config.healthcheckPort}`);
    });

    startWorkerLoop();

    // Graceful Shutdown
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.info(`Received ${signal}. Triggering worker graceful shutdown...`);

      healthServer.close(() => {
        logger.info('Worker health server closed');
      });

      if (currentTaskPromise) {
        logger.info('Waiting for active submission analysis to complete...');
        await currentTaskPromise;
      }

      try {
        await redisClient.quit();
        logger.info('Redis connection closed (Worker)');
        await dbPool.end();
        logger.info('PostgreSQL connection pool drained (Worker)');
        logger.info('Graceful shutdown finished. Exiting.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown cleanups in Worker', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('Failed to initialize worker service', err);
    process.exit(1);
  }
}

startWorker();
