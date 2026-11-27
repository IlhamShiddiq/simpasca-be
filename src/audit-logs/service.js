import { HttpError } from '../errors.js';
import { positiveId, validateQuery } from './validation.js';

function found(row) {
  if (!row) throw new HttpError(404, 'Audit log tidak ditemukan.');
  return row;
}

export function createService(repository) {
  return {
    async list(query, actor) {
      const filters = { ...validateQuery(query), hideUsers: !actor };
      const { data, total } = await repository.list(filters);
      return { data, meta: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) } };
    },
    async find(id, actor) {
      const entry = found(await repository.find(positiveId(id)));
      if (!actor && entry.entity_type === 'users') found(undefined);
      return entry;
    },
  };
}
