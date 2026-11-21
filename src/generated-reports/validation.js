import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['disaster_id', 'report_snapshot', 'generated_by', 'generated_by_name'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['disaster_id', 'report_snapshot', 'generated_by_name'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['disaster_id', 'report_snapshot', 'generated_by', 'generated_by_name']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.disaster_id !== undefined) result.disaster_id = validateValue(body.disaster_id, { type: 'id' }, 'disaster_id');
  if (body.report_snapshot !== undefined) result.report_snapshot = validateValue(body.report_snapshot, { type: 'json' }, 'report_snapshot');
  if (body.generated_by !== undefined) result.generated_by = validateValue(body.generated_by, { type: 'id', immutable: true }, 'generated_by');
  if (body.generated_by_name !== undefined) result.generated_by_name = validateValue(body.generated_by_name, { type: 'text', max: 150 }, 'generated_by_name');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'disaster_id', 'generated_by'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.disaster_id !== undefined) result.disaster_id = validateValue(query.disaster_id, { type: 'id' }, 'disaster_id');
  if (query.generated_by !== undefined) result.generated_by = validateValue(query.generated_by, { type: 'id', immutable: true }, 'generated_by');
  return result;
}
