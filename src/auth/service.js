import { randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { HttpError } from '../errors.js';
import { validateLogin } from './validation.js';

const scrypt = promisify(scryptCallback);
const unauthorized = () => new HttpError(401, 'Bearer token tidak valid, kedaluwarsa, atau sudah dicabut.');
// Always perform scrypt, including unknown usernames, to reduce username timing leaks.
const dummyHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;

export function createService(repository, options) {
  if (typeof options.secret !== 'string' || Buffer.byteLength(options.secret) < 32) {
    throw new Error('JWT_SECRET wajib diisi minimal 32 byte.');
  }
  if (!Number.isInteger(options.expiresIn) || options.expiresIn < 60 || options.expiresIn > 86400) {
    throw new Error('JWT_EXPIRES_IN_SECONDS harus integer antara 60 dan 86400.');
  }
  return {
    async login(body) {
      const { username, password } = validateLogin(body);
      const user = await repository.findByUsername(username);
      const hash = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user?.password_hash ?? '') ? user.password_hash : dummyHash;
      const [, salt, stored] = hash.split(':');
      const actual = await scrypt(password, salt, 64);
      if (!timingSafeEqual(actual, Buffer.from(stored, 'hex')) || !user || hash === dummyHash) {
        throw new HttpError(401, 'Username atau password salah.');
      }
      const accessToken = jwt.sign({}, options.secret, {
        algorithm: 'HS256', subject: String(user.id), jwtid: randomUUID(),
        expiresIn: options.expiresIn, issuer: options.issuer, audience: options.audience,
      });
      const { password_hash, ...safeUser } = user;
      return { access_token: accessToken, token_type: 'Bearer', expires_in: options.expiresIn, user: safeUser };
    },
    async authenticate(header) {
      if (typeof header !== 'string' || !/^Bearer [^\s]+$/i.test(header)) throw unauthorized();
      let payload;
      try {
        payload = jwt.verify(header.slice(7), options.secret, {
          algorithms: ['HS256'], issuer: options.issuer, audience: options.audience,
        });
      } catch { throw unauthorized(); }
      if (typeof payload !== 'object' || !/^[1-9]\d*$/.test(payload.sub ?? '')
        || Number(payload.sub) > 2147483647 || !Number.isInteger(payload.exp)
        || typeof payload.jti !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(payload.jti)) throw unauthorized();
      if (await repository.isRevoked(payload.jti)) throw unauthorized();
      const user = await repository.findById(Number(payload.sub));
      if (!user) throw unauthorized();
      return { user, jti: payload.jti, expiresAt: new Date(payload.exp * 1000) };
    },
    async logout(auth) { await repository.revoke(auth.jti, auth.expiresAt); },
  };
}