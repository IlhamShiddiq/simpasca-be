import { HttpError } from '../errors.js';

const fail = (message) => { throw new HttpError(422, message); };
const integerMax = 2147483647;

export function validateValue(value, field, name) {
  if (value === null && field.nullable) return null;
  switch (field.type) {
    case 'id':
    case 'integer': {
      if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value))
        || !Number.isInteger(Number(value)) || Number(value) > integerMax
        || Number(value) < (field.type === 'id' ? 1 : field.min ?? 0)) fail(`${name} harus berupa integer dalam rentang yang valid.`);
      return Number(value);
    }
    case 'text':
    case 'password': {
      if (typeof value !== 'string' || value.includes('\0') || value.length > field.max
        || (field.type === 'password' ? value.length < field.min : !value.trim())) {
        fail(`${name} harus berupa string tidak kosong, ${field.min ? `minimal ${field.min}, ` : ''}maksimal ${field.max} karakter.`);
      }
      return field.type === 'password' ? value : value.trim();
    }
    case 'decimal': {
      const pattern = new RegExp(`^${field.signed ? '-?' : ''}\\d{1,${field.digits ?? 15 - field.scale}}(\\.\\d{1,${field.scale}})?$`);
      if (!['string', 'number'].includes(typeof value) || !pattern.test(String(value))
        || (field.positive && Number(value) <= 0) || (field.min !== undefined && Number(value) < field.min)
        || (field.max !== undefined && Number(value) > field.max)) fail(`${name} harus berupa desimal dalam rentang valid, maksimal ${field.scale} angka desimal.`);
      return String(value);
    }
    case 'date':
    case 'timestamp': {
      const day = typeof value === 'string' ? value.slice(0, 10) : '';
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000')
        || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day
        || (field.type === 'date' && value !== day)
        || (field.type === 'timestamp' && (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
          || !Number.isFinite(Date.parse(value))))) fail(`${name} harus berupa ${field.type === 'date' ? 'tanggal YYYY-MM-DD' : 'timestamp ISO 8601 dengan zona waktu'} yang valid.`);
      return value;
    }
    case 'json':
      if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).includes('\\u0000')) {
        fail(`${name} harus berupa object JSON tanpa karakter null.`);
      }
      return value;
    default: throw new Error(`Unknown field type: ${field.type}`);
  }
}

export const positiveId = (value) => validateValue(value, { type: 'id' }, 'id');
