import { HttpError } from '../errors.js';
import { positiveId, validateValue } from '../shared/validation.js';

export { positiveId };

const fail = (message) => { throw new HttpError(422, message); };
const fields = ['disaster_type', 'province', 'regency_city', 'latitude', 'longitude', 'location_details', 'status', 'handling_scale', 'occurred_at', 'affected_people', 'affected_households', 'impact_notes', 'created_by'];

export function validateBody(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Body harus berupa object JSON.');
  const allowed = partial ? ['disaster_type', 'province', 'regency_city', 'latitude', 'longitude', 'location_details', 'status', 'handling_scale', 'occurred_at', 'affected_people', 'affected_households', 'impact_notes'] : fields;
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Terdapat field yang tidak diizinkan atau tidak dapat diubah.');
  if (partial && Object.keys(body).length === 0) fail('Minimal satu field harus diisi.');
  if (!partial) {
    for (const key of ['disaster_type', 'province', 'regency_city', 'status', 'handling_scale', 'occurred_at', 'created_by']) {
      if (body[key] === undefined) fail(`${key} wajib diisi.`);
    }
  }
  const result = {};
  if (body.disaster_type !== undefined) result.disaster_type = validateValue(body.disaster_type, { type: 'text', max: 100 }, 'disaster_type');
  if (body.province !== undefined) result.province = validateValue(body.province, { type: 'text', max: 150 }, 'province');
  if (body.regency_city !== undefined) result.regency_city = validateValue(body.regency_city, { type: 'text', max: 150 }, 'regency_city');
  if (body.latitude !== undefined) result.latitude = validateValue(body.latitude, { type: 'decimal', scale: 7, optional: true, nullable: true, min: -90, max: 90, digits: 3, signed: true }, 'latitude');
  if (body.longitude !== undefined) result.longitude = validateValue(body.longitude, { type: 'decimal', scale: 7, optional: true, nullable: true, min: -180, max: 180, digits: 3, signed: true }, 'longitude');
  if (body.location_details !== undefined) result.location_details = validateValue(body.location_details, { type: 'text', max: 5000, optional: true, nullable: true }, 'location_details');
  if (body.status !== undefined) result.status = validateValue(body.status, { type: 'text', max: 50 }, 'status');
  if (body.handling_scale !== undefined) result.handling_scale = validateValue(body.handling_scale, { type: 'text', max: 50 }, 'handling_scale');
  if (body.occurred_at !== undefined) result.occurred_at = validateValue(body.occurred_at, { type: 'timestamp' }, 'occurred_at');
  if (body.affected_people !== undefined) result.affected_people = validateValue(body.affected_people, { type: 'integer', optional: true, min: 0 }, 'affected_people');
  if (body.affected_households !== undefined) result.affected_households = validateValue(body.affected_households, { type: 'integer', optional: true, min: 0 }, 'affected_households');
  if (body.impact_notes !== undefined) result.impact_notes = validateValue(body.impact_notes, { type: 'text', max: 5000, optional: true, nullable: true }, 'impact_notes');
  if (body.created_by !== undefined) result.created_by = validateValue(body.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}

export function validateQuery(query) {
  const allowed = ['page', 'limit', 'status', 'disaster_type', 'province', 'regency_city', 'created_by'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Parameter query tidak dikenal.');
  if (Object.values(query).some((value) => typeof value !== 'string')) fail('Parameter query tidak boleh berulang atau berbentuk object.');
  const result = { page: positiveId(query.page ?? '1'), limit: positiveId(query.limit ?? '20') };
  if (result.limit > 100 || !Number.isSafeInteger((result.page - 1) * result.limit)) fail('Paginasi di luar batas; limit maksimal 100.');
  if (query.status !== undefined) result.status = validateValue(query.status, { type: 'text', max: 50 }, 'status');
  if (query.disaster_type !== undefined) result.disaster_type = validateValue(query.disaster_type, { type: 'text', max: 100 }, 'disaster_type');
  if (query.province !== undefined) result.province = validateValue(query.province, { type: 'text', max: 150 }, 'province');
  if (query.regency_city !== undefined) result.regency_city = validateValue(query.regency_city, { type: 'text', max: 150 }, 'regency_city');
  if (query.created_by !== undefined) result.created_by = validateValue(query.created_by, { type: 'id', immutable: true }, 'created_by');
  return result;
}
