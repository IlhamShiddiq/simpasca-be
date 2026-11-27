import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['item_id', 'quantity', 'receipt_date', 'source_giver', 'item_condition', 'notes', 'request_key', 'created_by'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['quantity', 'receipt_date', 'source_giver', 'item_condition', 'notes'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['item_id', 'quantity', 'receipt_date', 'source_giver', 'item_condition', 'request_key', 'created_by']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.item_id !== undefined) result.item_id = validateValue(body.item_id, { type: 'id', immutable: true }, 'item_id');
  if (body.quantity !== undefined) result.quantity = String(validateValue(body.quantity, { type: 'integer', min: 1 }, 'quantity'));
  if (body.receipt_date !== undefined) result.receipt_date = validateValue(body.receipt_date, { type: 'date' }, 'receipt_date');
  if (body.source_giver !== undefined) result.source_giver = validateValue(body.source_giver, { type: 'text', max: 150 }, 'source_giver');
  if (body.item_condition !== undefined) result.item_condition = validateValue(body.item_condition, { type: 'text', max: 100 }, 'item_condition');
  if (body.notes !== undefined) result.notes = validateValue(body.notes, { type: 'text', max: 5000, optional: true, nullable: true }, 'notes');
  if (body.request_key !== undefined) result.request_key = validateValue(body.request_key, { type: 'text', max: 100, immutable: true }, 'request_key');
  if (body.created_by !== undefined) result.created_by = validateValue(body.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'item_id', 'item_condition', 'created_by'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.item_id !== undefined) result.item_id = validateValue(query.item_id, { type: 'id', immutable: true }, 'item_id');
  if (query.item_condition !== undefined) result.item_condition = validateValue(query.item_condition, { type: 'text', max: 100 }, 'item_condition');
  if (query.created_by !== undefined) result.created_by = validateValue(query.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}
