import { HttpError } from '../errors.js';
import { actorOf, assertStock, today, withoutClientFields } from '../shared/domain.js';
import { positiveId, validateBody, validateQuery } from './validation.js';

function found(row) {
  if (!row) throw new HttpError(404, 'Penerimaan barang tidak ditemukan.');
  return row;
}

async function lockItem(tx, itemId) {
  const item = (await tx.lockItems([itemId])).get(itemId);
  if (!item) throw new HttpError(422, 'Barang tidak ditemukan atau sudah dihapus.');
  return item;
}

export function createService(repository) {
  return {
    async list(query) {
      const filters = validateQuery(query);
      const { data, total } = await repository.list(filters);
      return { data, meta: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) } };
    },
    async find(id) { return found(await repository.find(positiveId(id))); },
    /** The receipt and its PENERIMAAN movement are written together (UC-08, AC-22). */
    async create(body, actor) {
      const { id: userId } = actorOf(actor);
      const data = validateBody({ ...withoutClientFields(body, ['created_by']), created_by: userId });
      return repository.transaction(async (tx) => {
        await lockItem(tx, data.item_id);
        const receipt = await tx.create(data);
        await tx.addMovement({
          itemId: receipt.item_id, type: 'PENERIMAAN', delta: Number(receipt.quantity), date: receipt.receipt_date,
          notes: `Penerimaan dari ${receipt.source_giver}`, receiptId: receipt.id, userId,
        });
        return receipt;
      });
    },
    /** A changed quantity becomes a KOREKSI movement, never below zero stock (KF-09.3). Audited. */
    async update(id, body, actor) {
      const receiptId = positiveId(id);
      const data = validateBody(body, true);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(receiptId));
        const item = await lockItem(tx, before.item_id);
        const delta = data.quantity === undefined ? 0 : Number(data.quantity) - Number(before.quantity);
        if (delta < 0) assertStock((await tx.stockLevels([item.id])).get(item.id), delta, item);
        const after = found(await tx.update(receiptId, data));
        await tx.addMovement({
          itemId: item.id, type: 'KOREKSI', delta, date: today(), receiptId, userId,
          notes: `Koreksi penerimaan ${Number(before.quantity)} -> ${Number(after.quantity)}`,
        });
        await tx.audit({ userId, action: 'UBAH', entityType: 'stock_receipts', entityId: receiptId, before, after });
        return after;
      });
    },
    /** Soft delete; its quantity leaves stock again as KOREKSI, refused if already shipped out. Audited. */
    async remove(id, actor) {
      const receiptId = positiveId(id);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(receiptId));
        const item = await lockItem(tx, before.item_id);
        const delta = -Number(before.quantity);
        assertStock((await tx.stockLevels([item.id])).get(item.id), delta, item);
        await tx.addMovement({
          itemId: item.id, type: 'KOREKSI', delta, date: today(), receiptId, userId,
          notes: `Penerimaan dari ${before.source_giver} dihapus`,
        });
        found(await tx.remove(receiptId));
        await tx.audit({ userId, action: 'HAPUS', entityType: 'stock_receipts', entityId: receiptId, before });
        return before;
      });
    },
  };
}
