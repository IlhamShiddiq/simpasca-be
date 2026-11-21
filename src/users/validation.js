import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['name', 'username', 'password', 'role'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['name', 'username', 'password', 'role'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['name', 'username', 'password', 'role']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.name !== undefined) result.name = validateValue(body.name, { type: 'text', max: 150 }, 'name');
  if (body.username !== undefined) result.username = validateValue(body.username, { type: 'text', max: 100 }, 'username');
  if (body.password !== undefined) result.password = validateValue(body.password, { type: 'password', min: 12, max: 256 }, 'password');
  if (body.role !== undefined) result.role = validateValue(body.role, { type: 'text', max: 50 }, 'role');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'username', 'role'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.username !== undefined) result.username = validateValue(query.username, { type: 'text', max: 100 }, 'username');
  if (query.role !== undefined) result.role = validateValue(query.role, { type: 'text', max: 50 }, 'role');
  return result;
}
