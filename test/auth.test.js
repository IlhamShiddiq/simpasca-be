import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createService } from '../src/auth/service.js';
import { authOptions, tokenFor, passwordHash } from './helpers/auth.js';
import { modules } from './helpers/modules.js';

test('auth validates config, credentials, JWT signature, expiry, issuer and revocation', async () => {
  const user = { id: 1, username: 'admin', name: 'Admin', role: 'admin', password_hash: passwordHash('test-password-123') };
  const revoked = new Set();
  const repository = {
    findByUsername: async (username) => username === user.username ? user : undefined,
    findById: async (id) => id === 1 ? { id: 1, username: 'admin', name: 'Admin', role: 'admin' } : undefined,
    isRevoked: async (jti) => revoked.has(jti), revoke: async (jti) => revoked.add(jti),
  };
  assert.throws(() => createService(repository, { ...authOptions, secret: '' }), /JWT_SECRET/);
  assert.throws(() => createService(repository, { ...authOptions, expiresIn: 0 }), /JWT_EXPIRES/);
  const service = createService(repository, authOptions);
  await assert.rejects(service.login({ username: 'admin', password: 'wrong' }), { status: 401 });
  await assert.rejects(service.login({ username: 'missing', password: 'wrong' }), { status: 401 });
  await assert.rejects(service.login({ username: 'admin', password: 'test-password-123', role: 'admin' }), { status: 422 });
  const login = await service.login({ username: 'admin', password: 'test-password-123' });
  assert.equal(login.user.password_hash, undefined);
  assert.equal(login.token_type, 'Bearer');
  const auth = await service.authenticate(`Bearer ${login.access_token}`);
  assert.equal(auth.user.id, 1);
  for (const header of [undefined, 'Basic x', 'Bearer invalid', `Bearer ${tokenFor(1, {}, 'wrong-secret')}`,
    `Bearer ${tokenFor(2)}`, `Bearer ${tokenFor(1, { jti: 'bad' })}`,
    `Bearer ${jwt.sign({ sub: '1', jti: auth.jti }, authOptions.secret, { expiresIn: -1, issuer: authOptions.issuer, audience: authOptions.audience })}`,
    `Bearer ${jwt.sign({ sub: '1', jti: auth.jti }, authOptions.secret, { expiresIn: 3600, issuer: 'wrong', audience: authOptions.audience })}`]) {
    await assert.rejects(service.authenticate(header), { status: 401 });
  }
  await service.logout(auth);
  await assert.rejects(service.authenticate(`Bearer ${login.access_token}`), { status: 401 });
});

test('writes, account reads and auth/me/logout require a bearer token before database access; other reads are public', async (t) => {
  const server = createApp({ query: async () => { throw new Error('test double: database offline'); } }, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  for (const path of ['cash-transactions', ...modules.map((entry) => entry.path)]) {
    for (const [suffix, method] of [['', 'POST'], ['/1', 'PATCH'], ['/1', 'DELETE'], ...(path === 'users' ? [['', 'GET'], ['/1', 'GET']] : [])]) {
      const response = await fetch(`${base}/${path}${suffix}`, { method });
      assert.equal(response.status, 401, `${method} ${path}${suffix}`);
      assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    }
    if (path !== 'users') {
      // Public read: it reaches the database (which this double refuses) instead of stopping at auth.
      assert.notEqual((await fetch(`${base}/${path}`)).status, 401, `GET ${path}`);
    }
  }
  // A token that is sent must be valid, even on reads.
  assert.equal((await fetch(`${base}/disasters`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  assert.equal((await fetch(`${base}/auth/me`)).status, 401);
  assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST' })).status, 401);
});