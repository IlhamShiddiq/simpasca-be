import { HttpError } from '../errors.js';
import { actorOf, today, withoutClientFields } from '../shared/domain.js';
import { positiveId, validateBody, validateQuery } from './validation.js';

function found(row) {
  if (!row) throw new HttpError(404, 'Pengiriman tidak ditemukan.');
  return row;
}

/** Calendar day of a timestamp in WIB, the day stock leaves the warehouse. */
const dayOf = (timestamp) => new Date(timestamp).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

/**
 * Checks every line before anything is written (AB-03.2): the item exists, food is
 * not past its expiry (AC-14), and the quantity fits the stock plus what this
 * shipment already holds (AB-02.3). Any problem rejects the whole shipment.
 */
export function checkLines(lines, items, stock, own, shipDay) {
  const problems = [];
  const onDay = [shipDay, today()].sort().at(-1);
  for (const { item_id: itemId, quantity } of lines) {
    const held = own.get(itemId) ?? 0;
    // Lines that do not grow take nothing new out of stock.
    if (quantity <= held) continue;
    const item = items.get(itemId);
    if (!item) {
      problems.push(`Barang ${itemId} tidak ditemukan atau sudah dihapus.`);
      continue;
    }
    if (item.category === 'PANGAN' && item.expiration_date && item.expiration_date < onDay) {
      problems.push(`${item.name} sudah kedaluwarsa (${item.expiration_date}) sehingga tidak dapat dikirim.`);
    }
    const available = (stock.get(itemId) ?? 0) + held;
    if (quantity > available) {
      problems.push(`Jumlah ${item.name} melebihi stok tersedia (${available} ${item.stock_unit}).`);
    }
  }
  if (problems.length > 0) throw new HttpError(422, `Pengiriman ditolak. ${problems.join(' ')}`);
}

async function requireLiveDisaster(tx, disasterId) {
  if (!(await tx.liveDisaster(disasterId))) throw new HttpError(422, 'Bencana tidak ditemukan atau sudah dihapus.');
}

/**
 * Brings a shipment's lines to `lines` inside the current transaction: new lines
 * leave stock as PENGIRIMAN, changes and removals are KOREKSI (KF-06.2, KF-09.3).
 */
async function applyLines(tx, shipment, current, lines, userId) {
  const own = new Map(current.map((row) => [row.item_id, Number(row.quantity)]));
  const ids = [...new Set([...own.keys(), ...lines.map((line) => line.item_id)])];
  const items = await tx.lockItems(ids);
  checkLines(lines, items, await tx.stockLevels(ids), own, dayOf(shipment.shipped_at));

  const base = { userId, disasterId: shipment.disaster_id };
  for (const row of current) {
    if (!lines.some((line) => line.item_id === row.item_id)) {
      await tx.addMovement({ ...base, itemId: row.item_id, shipmentItemId: row.id, type: 'KOREKSI', delta: Number(row.quantity), date: today(), notes: `Barang dikeluarkan dari pengiriman ${shipment.id}` });
      await tx.removeItem(row.id);
    }
  }
  for (const { item_id: itemId, quantity } of lines) {
    const held = own.get(itemId);
    if (held === quantity) continue;
    const row = await tx.upsertItem(shipment.id, itemId, quantity);
    await tx.addMovement(held === undefined
      ? { ...base, itemId, shipmentItemId: row.id, type: 'PENGIRIMAN', delta: -quantity, date: dayOf(shipment.shipped_at), notes: `Pengiriman ${shipment.id}` }
      : { ...base, itemId, shipmentItemId: row.id, type: 'KOREKSI', delta: held - quantity, date: today(), notes: `Koreksi pengiriman ${shipment.id}: ${held} -> ${quantity}` });
  }
  return tx.liveItems(shipment.id);
}

export function createService(repository) {
  return {
    async list(query) {
      const filters = validateQuery(query);
      const { data, total } = await repository.list(filters);
      return { data, meta: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) } };
    },
    async find(id) {
      const shipment = found(await repository.find(positiveId(id)));
      return { ...shipment, items: await repository.liveItems(shipment.id) };
    },
    /** Shipment, items and PENGIRIMAN movements in one transaction (AB-03.1–AB-03.2); request_key stops duplicates (AB-03.4). */
    async create(body, actor) {
      const { id: userId } = actorOf(actor);
      const { items: lines, ...data } = validateBody({ ...withoutClientFields(body, ['created_by']), created_by: userId });
      return repository.transaction(async (tx) => {
        await requireLiveDisaster(tx, data.disaster_id);
        const shipment = await tx.create({ ...data, status: 'DIKIRIM', received_at: null });
        const items = await applyLines(tx, shipment, [], lines, userId);
        return { ...shipment, items };
      });
    },
    /**
     * Corrects fields and/or lines, or confirms receipt. DIKIRIM -> DITERIMA only stores
     * received_at and never touches stock (AB-03.3). Audited (KF-09.1).
     */
    async update(id, body, actor) {
      const shipmentId = positiveId(id);
      const { items: lines, ...data } = validateBody(body, true);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(shipmentId));
        const beforeItems = await tx.liveItems(shipmentId);
        if (data.status !== undefined && data.status !== before.status) {
          if (before.status !== 'DIKIRIM' || data.status !== 'DITERIMA') throw new HttpError(422, 'Status hanya dapat diubah dari DIKIRIM menjadi DITERIMA.');
          if (!data.received_at) throw new HttpError(422, 'received_at wajib diisi saat konfirmasi penerimaan.');
        }
        if (data.received_at && before.status === 'DIKIRIM' && data.status !== 'DITERIMA') {
          throw new HttpError(422, 'received_at hanya diisi bersama perubahan status menjadi DITERIMA.');
        }
        const receivedAt = data.received_at === undefined ? before.received_at : data.received_at;
        const shippedAt = data.shipped_at ?? before.shipped_at;
        if (receivedAt && new Date(receivedAt) < new Date(shippedAt)) throw new HttpError(422, 'Tanggal penerimaan tidak boleh sebelum tanggal pengiriman.');
        if (receivedAt && new Date(receivedAt) > new Date()) throw new HttpError(422, 'Tanggal penerimaan tidak boleh di masa depan.');
        if (data.disaster_id !== undefined) await requireLiveDisaster(tx, data.disaster_id);

        const after = Object.keys(data).length > 0 ? found(await tx.update(shipmentId, data)) : before;
        const afterItems = lines ? await applyLines(tx, after, beforeItems, lines, userId) : beforeItems;
        await tx.audit({
          userId, action: 'UBAH', entityType: 'shipments', entityId: shipmentId,
          before: { ...before, items: beforeItems }, after: { ...after, items: afterItems },
        });
        return { ...after, items: afterItems };
      });
    },
    /** Soft delete; every line goes back into stock as KOREKSI (KF-09.3). Audited. */
    async remove(id, actor) {
      const shipmentId = positiveId(id);
      const { id: userId } = actorOf(actor);
      return repository.transaction(async (tx) => {
        const before = found(await tx.find(shipmentId));
        const items = await tx.liveItems(shipmentId);
        await tx.lockItems(items.map((row) => row.item_id));
        for (const row of items) {
          await tx.addMovement({
            userId, disasterId: before.disaster_id, itemId: row.item_id, shipmentItemId: row.id,
            type: 'KOREKSI', delta: Number(row.quantity), date: today(), notes: `Pengiriman ${shipmentId} dihapus`,
          });
          await tx.removeItem(row.id);
        }
        found(await tx.remove(shipmentId));
        await tx.audit({ userId, action: 'HAPUS', entityType: 'shipments', entityId: shipmentId, before: { ...before, items } });
        return before;
      });
    },
  };
}
