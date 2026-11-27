import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['name', 'category', 'stock_unit', 'initial_stock', 'need_ratio', 'need_type', 'ratio_basis', 'expiration_date', 'created_by'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['name', 'category', 'stock_unit', 'initial_stock', 'need_ratio', 'need_type', 'ratio_basis', 'expiration_date'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['name', 'category', 'stock_unit', 'created_by']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.name !== undefined) result.name = validateValue(body.name, { type: 'text', max: 150 }, 'name');
  if (body.category !== undefined) result.category = validateValue(body.category, { type: 'text', max: 100 }, 'category');
  if (body.stock_unit !== undefined) result.stock_unit = validateValue(body.stock_unit, { type: 'text', max: 50 }, 'stock_unit');
  if (body.initial_stock !== undefined) result.initial_stock = String(validateValue(body.initial_stock, { type: 'integer', min: 0 }, 'initial_stock'));
  if (body.need_ratio !== undefined) result.need_ratio = validateValue(body.need_ratio, { type: 'decimal', scale: 6, optional: true, nullable: true, positive: true }, 'need_ratio');
  if (body.need_type !== undefined) result.need_type = validateValue(body.need_type, { type: 'text', max: 50, optional: true, nullable: true }, 'need_type');
  if (body.ratio_basis !== undefined) result.ratio_basis = validateValue(body.ratio_basis, { type: 'text', max: 50, optional: true, nullable: true }, 'ratio_basis');
  if (body.expiration_date !== undefined) result.expiration_date = validateValue(body.expiration_date, { type: 'date', optional: true, nullable: true }, 'expiration_date');
  if (body.created_by !== undefined) result.created_by = validateValue(body.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'category', 'stock_unit', 'need_type', 'created_by'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.category !== undefined) result.category = validateValue(query.category, { type: 'text', max: 100 }, 'category');
  if (query.stock_unit !== undefined) result.stock_unit = validateValue(query.stock_unit, { type: 'text', max: 50 }, 'stock_unit');
  if (query.need_type !== undefined) result.need_type = validateValue(query.need_type, { type: 'text', max: 50, optional: true, nullable: true }, 'need_type');
  if (query.created_by !== undefined) result.created_by = validateValue(query.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}
