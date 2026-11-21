import { HttpError } from '../errors.js';
import { positiveId, validateBody, validateQuery } from './validation.js';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

async function prepare(body, partial = false) {
  const data = validateBody(body, partial);
  if (data.password !== undefined) {
    const salt = randomBytes(16).toString('hex');
    data.password_hash = `scrypt:${salt}:${(await scrypt(data.password, salt, 64)).toString('hex')}`;
    delete data.password;
  }
  return data;
}

function found(row) {
  if (!row) throw new HttpError(404, 'User tidak ditemukan.');
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
    async create(body) { return repository.create(await prepare(body)); },
    async update(id, body) { return found(await repository.update(positiveId(id), await prepare(body, true))); },
    async remove(id) { return found(await repository.remove(positiveId(id))); },
  };
}
