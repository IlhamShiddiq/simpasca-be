import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { createCorsOptions } from './cors.js';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './docs/openapi.js';
import { cashTransactionRoutes } from './cash-transactions/routes.js';
import { errorHandler } from './errors.js';

export function createApp(db, { corsOrigins = config.corsOrigins } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(corsOrigins)));
  app.use(express.json({ limit: '100kb' }));
  app.get('/docs/api/openapi.json', (req, res) => res.json(openapi));
  app.use('/docs/api', swaggerUi.serve, swaggerUi.setup(openapi, {
    customSiteTitle: 'SIMPASCA API Documentation',
    swaggerOptions: { validatorUrl: null },
  }));
  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable' });
    }
  });
  app.use('/api/cash-transactions', cashTransactionRoutes(db));
  app.use((req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan.' }));
  app.use(errorHandler);
  return app;
}