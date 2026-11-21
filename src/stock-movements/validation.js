import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['item_id', 'disaster_id', 'receipt_id', 'shipment_item_id', 'movement_type', 'quantity_in', 'quantity_out', 'movement_date', 'notes', 'created_by'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['item_id', 'disaster_id', 'receipt_id', 'shipment_item_id', 'movement_type', 'quantity_in', 'quantity_out', 'movement_date', 'notes'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['item_id', 'movement_type', 'movement_date', 'created_by']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.item_id !== undefined) result.item_id = validateValue(body.item_id, { type: 'id' }, 'item_id');
  if (body.disaster_id !== undefined) result.disaster_id = validateValue(body.disaster_id, { type: 'id', optional: true, nullable: true }, 'disaster_id');
  if (body.receipt_id !== undefined) result.receipt_id = validateValue(body.receipt_id, { type: 'id', optional: true, nullable: true }, 'receipt_id');
  if (body.shipment_item_id !== undefined) result.shipment_item_id = validateValue(body.shipment_item_id, { type: 'id', optional: true, nullable: true }, 'shipment_item_id');
  if (body.movement_type !== undefined) result.movement_type = validateValue(body.movement_type, { type: 'text', max: 50 }, 'movement_type');
  if (body.quantity_in !== undefined) result.quantity_in = validateValue(body.quantity_in, { type: 'decimal', scale: 3, optional: true, min: 0 }, 'quantity_in');
  if (body.quantity_out !== undefined) result.quantity_out = validateValue(body.quantity_out, { type: 'decimal', scale: 3, optional: true, min: 0 }, 'quantity_out');
  if (body.movement_date !== undefined) result.movement_date = validateValue(body.movement_date, { type: 'date' }, 'movement_date');
  if (body.notes !== undefined) result.notes = validateValue(body.notes, { type: 'text', max: 5000, optional: true, nullable: true }, 'notes');
  if (body.created_by !== undefined) result.created_by = validateValue(body.created_by, { type: 'id', immutable: true }, 'created_by');
  const incoming = Number(result.quantity_in ?? 0);
  const outgoing = Number(result.quantity_out ?? 0);
  if (!((incoming > 0 && outgoing === 0) || (outgoing > 0 && incoming === 0))) fail('Isi tepat satu arah quantity_in atau quantity_out yang positif.');
  if (result.receipt_id && result.shipment_item_id) fail('Mutasi tidak boleh merujuk penerimaan sekaligus pengiriman.');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'item_id', 'disaster_id', 'receipt_id', 'shipment_item_id', 'movement_type', 'created_by'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.item_id !== undefined) result.item_id = validateValue(query.item_id, { type: 'id' }, 'item_id');
  if (query.disaster_id !== undefined) result.disaster_id = validateValue(query.disaster_id, { type: 'id', optional: true, nullable: true }, 'disaster_id');
  if (query.receipt_id !== undefined) result.receipt_id = validateValue(query.receipt_id, { type: 'id', optional: true, nullable: true }, 'receipt_id');
  if (query.shipment_item_id !== undefined) result.shipment_item_id = validateValue(query.shipment_item_id, { type: 'id', optional: true, nullable: true }, 'shipment_item_id');
  if (query.movement_type !== undefined) result.movement_type = validateValue(query.movement_type, { type: 'text', max: 50 }, 'movement_type');
  if (query.created_by !== undefined) result.created_by = validateValue(query.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}
