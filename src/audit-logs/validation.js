import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['user_id', 'action', 'entity_type', 'entity_id', 'before_data', 'after_data'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['user_id', 'action', 'entity_type', 'entity_id', 'before_data', 'after_data'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['user_id', 'action', 'entity_type', 'entity_id']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.user_id !== undefined) result.user_id = validateValue(body.user_id, { type: 'id' }, 'user_id');
  if (body.action !== undefined) result.action = validateValue(body.action, { type: 'text', max: 100 }, 'action');
  if (body.entity_type !== undefined) result.entity_type = validateValue(body.entity_type, { type: 'text', max: 100 }, 'entity_type');
  if (body.entity_id !== undefined) result.entity_id = validateValue(body.entity_id, { type: 'id' }, 'entity_id');
  if (body.before_data !== undefined) result.before_data = validateValue(body.before_data, { type: 'json', optional: true, nullable: true }, 'before_data');
  if (body.after_data !== undefined) result.after_data = validateValue(body.after_data, { type: 'json', optional: true, nullable: true }, 'after_data');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'user_id', 'action', 'entity_type', 'entity_id'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.user_id !== undefined) result.user_id = validateValue(query.user_id, { type: 'id' }, 'user_id');
  if (query.action !== undefined) result.action = validateValue(query.action, { type: 'text', max: 100 }, 'action');
  if (query.entity_type !== undefined) result.entity_type = validateValue(query.entity_type, { type: 'text', max: 100 }, 'entity_type');
  if (query.entity_id !== undefined) result.entity_id = validateValue(query.entity_id, { type: 'id' }, 'entity_id');
  return result;
}
