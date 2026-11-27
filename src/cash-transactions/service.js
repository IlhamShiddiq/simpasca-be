import { HttpError } from '../errors.js';
import { actorOf, withoutClientFields } from '../shared/domain.js';
import { positiveId, validateBody, validateQuery } from './validation.js';

function found(row) {
  if (!row) throw new HttpError(404, 'Transaksi kas tidak ditemukan.');
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
    async create(body, actor) {
      return repository.create(validateBody({ ...withoutClientFields(body, ['created_by']), created_by: actorOf(actor).id }));
    },
    /** Audited (KF-09.1). */
    async update(id, body, actor) {
      const cashId = positiveId(id);
      const data = validateBody(body, true);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(cashId));
        const after = found(await tx.update(cashId, data));
        await tx.audit({ userId, action: 'UBAH', entityType: 'cash_transactions', entityId: cashId, before, after });
        return after;
      });
    },
    async remove(id, actor) {
      const cashId = positiveId(id);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(cashId));
        found(await tx.remove(cashId));
        await tx.audit({ userId, action: 'HAPUS', entityType: 'cash_transactions', entityId: cashId, before });
        return before;
      });
    },
    async summary(query) { return repository.summary(validateQuery(query)); },
  };
}