import { HttpError } from '../errors.js';
import { actorOf } from '../shared/domain.js';
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

/** Superadmin-only writes are enforced in routes; this guards against locking yourself out. */
export function createService(repository) {
  return {
    async list(query) {
      const filters = validateQuery(query);
      const { data, total } = await repository.list(filters);
      return { data, meta: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) } };
    },
    async find(id) { return found(await repository.find(positiveId(id))); },
    async create(body) { return repository.create(await prepare(body)); },
    async update(id, body, actor) {
      const userId = positiveId(id);
      const data = await prepare(body, true);
      const { id: actorId } = actorOf(actor);
      if (userId === actorId && data.role !== undefined && data.role !== 'SUPERADMIN') {
        throw new HttpError(422, 'Tidak dapat menurunkan peran akun sendiri.');
      }
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(userId));
        const after = found(await tx.update(userId, data));
        await tx.audit({
          userId: actorId, action: 'UBAH', entityType: 'users', entityId: userId, before,
          after: { ...after, ...(data.password_hash && { password_changed: true }) },
        });
        return after;
      });
    },
    async remove(id, actor) {
      const userId = positiveId(id);
      const { id: actorId } = actorOf(actor);
      if (userId === actorId) throw new HttpError(422, 'Tidak dapat menghapus akun sendiri.');
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(userId));
        found(await tx.remove(userId));
        await tx.audit({ userId: actorId, action: 'HAPUS', entityType: 'users', entityId: userId, before });
        return before;
      });
    },
  };
}
