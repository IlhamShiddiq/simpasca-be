import { Router } from 'express';
import { createController } from './controller.js';
import { createService } from './service.js';
import { createRepository } from './repository.js';

export function shipmentItemRoutes(db) {
  const router = Router();
  const controller = createController(createService(createRepository(db)));
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.find);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
