import { HttpError } from '../errors.js';

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['type', 'amount', 'description', 'transaction_date', 'request_key', 'created_by', 'disaster_id', 'receipt_id'];
const optional = ['description', 'disaster_id', 'receipt_id'];
const links = ['disaster_id', 'receipt_id'];

export function positiveId(value, field = 'id') {
  if (!['string', 'number'].includes(typeof value)
      || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))
      || (['id', 'created_by', ...links].includes(field) && Number(value) > 2147483647)) {
    fail(`${field} harus berupa integer positif yang aman.`);
  }
  return Number(value);
}

function date(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString().slice(0, 10) !== value || value.startsWith('0000')) {
    fail(`${field} harus berupa tanggal valid YYYY-MM-DD.`);
  }
  return value;
}

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? fields.filter((field) => !['request_key', 'created_by'].includes(field)) : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  const result = {};
  if (!partial) {
    for (const key of fields.filter((field) => !optional.includes(field))) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  if (body.type !== undefined) {
    if (!['income', 'expense'].includes(body.type)) fail('type harus income atau expense.');
    result.type = body.type;
  }
  if (body.amount !== undefined) {
    const amount = String(body.amount);
    if (!['number', 'string'].includes(typeof body.amount)
        || !/^\d{1,13}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      fail('amount harus positif, maksimal 13 digit dan 2 angka desimal.');
    }
    result.amount = amount;
  }
  if (body.description !== undefined) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 5000)) {
      fail('description maksimal 5000 karakter atau null.');
    }
    result.description = body.description;
  }
  if (body.transaction_date !== undefined) result.transaction_date = date(body.transaction_date, 'transaction_date');
  if (body.request_key !== undefined) {
    if (typeof body.request_key !== 'string' || !body.request_key.trim() || body.request_key.length > 100) {
      fail('request_key wajib berupa string, maksimal 100 karakter.');
    }
    result.request_key = body.request_key.trim();
  }
  if (body.created_by !== undefined) result.created_by = positiveId(body.created_by, 'created_by');
  for (const key of links) {
    if (body[key] !== undefined) result[key] = body[key] === null ? null : positiveId(body[key], key);
  }
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'type', 'date_from', 'date_to', ...links];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  for (const value of Object.values(query)) {
    if (typeof value !== 'string') fail('Parameter query tidak boleh berulang atau berbentuk object.');
  }
  const result = { page: positiveId(query.page ?? '1', 'page'), limit: positiveId(query.limit ?? '20', 'limit') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.type !== undefined) {
    if (!['income', 'expense'].includes(query.type)) fail('type harus income atau expense.');
    result.type = query.type;
  }
  for (const key of ['date_from', 'date_to']) {
    if (query[key] !== undefined) result[key] = date(query[key], key);
  }
  for (const key of links) {
    if (query[key] !== undefined) result[key] = positiveId(query[key], key);
  }
  if (result.date_from && result.date_to && result.date_from > result.date_to) fail('date_from tidak boleh melebihi date_to.');
  return result;
}