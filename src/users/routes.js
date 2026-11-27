import { Router } from 'express';
import { requireSuperadminForWrites } from '../auth/middleware.js';
import { createController } from './controller.js';
import { createService } from './service.js';
import { createRepository } from './repository.js';

export function userRoutes(db) {
  const router = Router();
  router.use(requireSuperadminForWrites);
  const controller = createController(createService(createRepository(db)));
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.find);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
