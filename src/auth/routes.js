import { Router } from 'express';
import { createController } from './controller.js';
import { requireAuth } from './middleware.js';

export function authRoutes(service) {
  const router = Router();
  const controller = createController(service);
  router.post('/login', controller.login);
  router.get('/me', requireAuth(service), controller.me);
  router.post('/logout', requireAuth(service), controller.logout);
  return router;
}