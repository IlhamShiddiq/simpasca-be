import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['disaster_id', 'status', 'shipped_at', 'received_at', 'destination', 'person_in_charge', 'request_key', 'created_by'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['disaster_id', 'status', 'shipped_at', 'received_at', 'destination', 'person_in_charge'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['disaster_id', 'status', 'destination', 'person_in_charge', 'request_key', 'created_by']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.disaster_id !== undefined) result.disaster_id = validateValue(body.disaster_id, { type: 'id' }, 'disaster_id');
  if (body.status !== undefined) result.status = validateValue(body.status, { type: 'text', max: 50 }, 'status');
  if (body.shipped_at !== undefined) result.shipped_at = validateValue(body.shipped_at, { type: 'timestamp', optional: true, nullable: true }, 'shipped_at');
  if (body.received_at !== undefined) result.received_at = validateValue(body.received_at, { type: 'timestamp', optional: true, nullable: true }, 'received_at');
  if (body.destination !== undefined) result.destination = validateValue(body.destination, { type: 'text', max: 5000 }, 'destination');
  if (body.person_in_charge !== undefined) result.person_in_charge = validateValue(body.person_in_charge, { type: 'text', max: 150 }, 'person_in_charge');
  if (body.request_key !== undefined) result.request_key = validateValue(body.request_key, { type: 'text', max: 100, immutable: true }, 'request_key');
  if (body.created_by !== undefined) result.created_by = validateValue(body.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'disaster_id', 'status', 'created_by'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.disaster_id !== undefined) result.disaster_id = validateValue(query.disaster_id, { type: 'id' }, 'disaster_id');
  if (query.status !== undefined) result.status = validateValue(query.status, { type: 'text', max: 50 }, 'status');
  if (query.created_by !== undefined) result.created_by = validateValue(query.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}
