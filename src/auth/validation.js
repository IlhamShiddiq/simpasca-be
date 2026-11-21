import { HttpError } from '../errors.js';

export function validateLogin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['username', 'password'].includes(key))
    || typeof body.username !== 'string' || !body.username.trim() || body.username.length > 100
    || typeof body.password !== 'string' || !body.password.length || body.password.length > 256
    || body.username.includes('\0') || body.password.includes('\0')) {
    throw new HttpError(422, 'username dan password wajib berupa string yang valid.');
  }
  return { username: body.username.trim(), password: body.password };
}