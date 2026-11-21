import { HttpError } from '../errors.js';
import { positiveId, validateBody, validateQuery } from './validation.js';

function found(row) {
  if (!row) throw new HttpError(404, 'Audit log tidak ditemukan.');
  return row;
}

export function createService(repository) {
  return {
    async list(query) {
      const filters = validateQuery(query);
      const { data, total } = await repository.list(filters);
      return { data, meta: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) } };
    },
    async find(id) { return found(await repository.find(positiveId(id))); },
    async create(body) { return repository.create(validateBody(body)); },
  };
}
