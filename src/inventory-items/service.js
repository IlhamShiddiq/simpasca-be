import { HttpError } from '../errors.js';
import { actorOf, assertStock, today, withoutClientFields } from '../shared/domain.js';
import { positiveId, validateBody, validateQuery } from './validation.js';

function found(row) {
  if (!row) throw new HttpError(404, 'Barang inventaris tidak ditemukan.');
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
    /** The item and its opening stock (STOK_AWAL) are written together (KF-06.2). */
    async create(body, actor) {
      const { id: userId } = actorOf(actor);
      const data = validateBody({ ...withoutClientFields(body, ['created_by']), created_by: userId });
      return repository.transaction(async (tx) => {
        const item = await tx.create(data);
        await tx.addMovement({
          itemId: item.id, type: 'STOK_AWAL', delta: Number(item.initial_stock), date: today(), notes: 'Stok awal', userId,
        });
        return item;
      });
    },
    /** A changed opening stock is never overwritten silently: the difference is a KOREKSI movement (KF-06.3). Audited. */
    async update(id, body, actor) {
      const itemId = positiveId(id);
      const data = validateBody(body, true);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(itemId));
        const delta = data.initial_stock === undefined ? 0 : Number(data.initial_stock) - Number(before.initial_stock);
        if (delta < 0) assertStock((await tx.stockLevels([itemId])).get(itemId), delta, before);
        const after = found(await tx.update(itemId, data));
        await tx.addMovement({
          itemId, type: 'KOREKSI', delta, date: today(), userId,
          notes: `Koreksi stok awal ${Number(before.initial_stock)} -> ${Number(after.initial_stock)}`,
        });
        await tx.audit({ userId, action: 'UBAH', entityType: 'inventory_items', entityId: itemId, before, after });
        return after;
      });
    },
    /** Soft delete: its stock history stays (AC-18). Audited. */
    async remove(id, actor) {
      const itemId = positiveId(id);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(itemId));
        found(await tx.remove(itemId));
        await tx.audit({ userId, action: 'HAPUS', entityType: 'inventory_items', entityId: itemId, before });
        return before;
      });
    },
  };
}
