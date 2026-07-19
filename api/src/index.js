import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import logger from './logger.js';
import {
  dbPool,
  redisClient,
  checkDatabaseHealth,
  checkRedisHealth,
} from './database.js';
import { validateFormDefinition } from './validation.js';

const app = express();

// 1. Security Enhancements
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '50kb' })); // Adjusted slightly to allow larger form structures

// UUID Validation Regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 2. Health & Monitoring Endpoints
app.get('/live', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const redisHealth = await checkRedisHealth();
  const isReady = dbHealth.status === 'UP' && redisHealth.status === 'UP';
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'READY' : 'NOT_READY',
    db: dbHealth.status,
    redis: redisHealth.status,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const redisHealth = await checkRedisHealth();
  const isHealthy = dbHealth.status === 'UP' && redisHealth.status === 'UP';
  const report = {
    status: isHealthy ? 'UP' : 'DOWN',
    services: {
      database: dbHealth,
      redis: redisHealth,
    },
    timestamp: new Date().toISOString(),
  };

  if (!isHealthy) {
    logger.warn('Health check failed', report);
    return res.status(503).json(report);
  }
  res.status(200).json(report);
});

// 3. API - Dynamic Forms routes

// Create a new Form definition
app.post('/api/forms', async (req, res) => {
  const { title, description, fields } = req.body;

  // Schema validation
  const validationError = validateFormDefinition(title, fields);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const query = `
      INSERT INTO forms (title, description, fields)
      VALUES ($1, $2, $3)
      RETURNING id, title, description, fields, created_at
    `;
    const result = await dbPool.query(query, [
      title.trim(),
      description ? description.trim() : '',
      JSON.stringify(fields)
    ]);
    const createdForm = result.rows[0];

    logger.info('Form created successfully', { formId: createdForm.id, title: createdForm.title });
    res.status(201).json(createdForm);
  } catch (error) {
    logger.error('Failed to create form schema', { error });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// List all Forms
app.get('/api/forms', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT id, title, description, created_at FROM forms ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to retrieve forms', { error });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get a single Form detail
app.get('/api/forms/:id', async (req, res) => {
  const { id } = req.params;

  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Invalid UUID format for form ID' });
  }

  try {
    const result = await dbPool.query('SELECT * FROM forms WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to retrieve form details', { id, error });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete a form
app.delete('/api/forms/:id', async (req, res) => {
  const { id } = req.params;

  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Invalid UUID format for form ID' });
  }

  try {
    const result = await dbPool.query('DELETE FROM forms WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }
    logger.info('Form deleted successfully', { formId: id });
    res.json({ message: 'Form deleted successfully', id });
  } catch (error) {
    logger.error('Failed to delete form', { id, error });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create a new Submission for a Form
app.post('/api/forms/:id/submissions', async (req, res) => {
  const { id: formId } = req.params;
  const { answers } = req.body;

  if (!uuidRegex.test(formId)) {
    return res.status(400).json({ error: 'Invalid UUID format for form ID' });
  }
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Field answers is required and must be an object' });
  }

  try {
    // Verify form exists
    const formCheck = await dbPool.query('SELECT id FROM forms WHERE id = $1', [formId]);
    if (formCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Target Form not found' });
    }

    // Insert submission in PENDING state
    const query = `
      INSERT INTO submissions (form_id, answers, status)
      VALUES ($1, $2, 'PENDING')
      RETURNING id, form_id, answers, status, created_at
    `;
    const result = await dbPool.query(query, [formId, JSON.stringify(answers)]);
    const submission = result.rows[0];

    logger.info('Submission recorded in DB', { submissionId: submission.id, formId });

    // Push submission message to Redis queue
    const message = JSON.stringify({
      submissionId: submission.id,
      formId: submission.form_id
    });
    await redisClient.rPush('submissions_queue', message);
    logger.info('Submission pushed to Redis queue', { submissionId: submission.id });

    res.status(201).json(submission);
  } catch (error) {
    logger.error('Failed to create or queue submission', { formId, error });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get all submissions for a Form
app.get('/api/forms/:id/submissions', async (req, res) => {
  const { id: formId } = req.params;

  if (!uuidRegex.test(formId)) {
    return res.status(400).json({ error: 'Invalid UUID format for form ID' });
  }

  try {
    const result = await dbPool.query(
      'SELECT * FROM submissions WHERE form_id = $1 ORDER BY created_at DESC LIMIT 50',
      [formId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to retrieve submissions', { formId, error });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Catch-all route handler for 404
app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

// Start up Server
const startServer = async () => {
  try {
    await redisClient.connect();
    logger.info('Redis connection initialized');

    // Auto-provision tables on startup (DevOps self-healing resiliency practice)
    await dbPool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS forms (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          fields JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS submissions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
          answers JSONB NOT NULL DEFAULT '{}'::jsonb,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          analysis JSONB,
          error TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await dbPool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await dbPool.query(`
      CREATE OR REPLACE TRIGGER update_forms_updated_at
          BEFORE UPDATE ON forms
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `);

    await dbPool.query(`
      CREATE OR REPLACE TRIGGER update_submissions_updated_at
          BEFORE UPDATE ON submissions
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `);

    logger.info('Database auto-provisioning completed successfully.');

    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`API Service listening on port ${config.port} in ${config.nodeEnv} mode`);
    });

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        try {
          await redisClient.quit();
          logger.info('Redis client disconnected');
          await dbPool.end();
          logger.info('PostgreSQL connection pool drained');
          logger.info('Shutdown complete. Exiting.');
          process.exit(0);
        } catch (err) {
          logger.error('Error during shutdown cleanups', err);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded, forcing exit.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('Failed to start API Service application', err);
    process.exit(1);
  }
};

startServer();
