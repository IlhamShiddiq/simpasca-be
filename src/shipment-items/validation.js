import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['shipment_id', 'item_id', 'quantity'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['quantity'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['shipment_id', 'item_id', 'quantity']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.shipment_id !== undefined) result.shipment_id = validateValue(body.shipment_id, { type: 'id', immutable: true }, 'shipment_id');
  if (body.item_id !== undefined) result.item_id = validateValue(body.item_id, { type: 'id', immutable: true }, 'item_id');
  if (body.quantity !== undefined) result.quantity = validateValue(body.quantity, { type: 'decimal', scale: 3, positive: true }, 'quantity');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'shipment_id', 'item_id'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.shipment_id !== undefined) result.shipment_id = validateValue(query.shipment_id, { type: 'id', immutable: true }, 'shipment_id');
  if (query.item_id !== undefined) result.item_id = validateValue(query.item_id, { type: 'id', immutable: true }, 'item_id');
  return result;
}
