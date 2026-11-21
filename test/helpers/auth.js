import { randomUUID, scryptSync } from 'node:crypto';
import jwt from 'jsonwebtoken';

export const authOptions = {
  secret: 'test-only-secret-not-for-production-123456789', expiresIn: 3600,
  issuer: 'simpasca-api', audience: 'simpasca-client',
};

export function tokenFor(id, overrides = {}, secret = authOptions.secret) {
  return jwt.sign({ sub: String(id), jti: randomUUID(), ...overrides }, secret, {
    algorithm: 'HS256', expiresIn: 3600, issuer: authOptions.issuer, audience: authOptions.audience,
  });
}

export function passwordHash(password) {
  const salt = '1234567890abcdef1234567890abcdef';
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}