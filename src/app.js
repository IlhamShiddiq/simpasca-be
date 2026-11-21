import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { createCorsOptions } from './cors.js';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './docs/openapi.js';
import { cashTransactionRoutes } from './cash-transactions/routes.js';
import { errorHandler } from './errors.js';
import { userRoutes } from './users/routes.js';
import { disasterRoutes } from './disasters/routes.js';
import { inventoryItemRoutes } from './inventory-items/routes.js';
import { shipmentRoutes } from './shipments/routes.js';
import { shipmentItemRoutes } from './shipment-items/routes.js';
import { stockReceiptRoutes } from './stock-receipts/routes.js';
import { stockMovementRoutes } from './stock-movements/routes.js';
import { generatedReportRoutes } from './generated-reports/routes.js';
import { auditLogRoutes } from './audit-logs/routes.js';
import { authRoutes } from './auth/routes.js';
import { createRepository as createAuthRepository } from './auth/repository.js';
import { createService as createAuthService } from './auth/service.js';
import { requireAuth } from './auth/middleware.js';

export function createApp(db, { corsOrigins = config.corsOrigins, auth = config.auth } = {}) {
  const authService = createAuthService(createAuthRepository(db), auth);
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
  app.use('/api/auth', authRoutes(authService));
  app.use('/api', requireAuth(authService));
  app.use('/api/cash-transactions', cashTransactionRoutes(db));
  app.use('/api/users', userRoutes(db));
  app.use('/api/disasters', disasterRoutes(db));
  app.use('/api/inventory-items', inventoryItemRoutes(db));
  app.use('/api/shipments', shipmentRoutes(db));
  app.use('/api/shipment-items', shipmentItemRoutes(db));
  app.use('/api/stock-receipts', stockReceiptRoutes(db));
  app.use('/api/stock-movements', stockMovementRoutes(db));
  app.use('/api/generated-reports', generatedReportRoutes(db));
  app.use('/api/audit-logs', auditLogRoutes(db));
  app.use((req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan.' }));
  app.use(errorHandler);
  return app;
}