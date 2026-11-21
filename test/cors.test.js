import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createCorsOptions } from '../src/cors.js';
import { authOptions } from './helpers/auth.js';

async function serve(t, corsOrigins) {
  const server = createApp({ query: async () => ({ rows: [] }) }, { corsOrigins, auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('wildcard permits any origin and handles JSON/PATCH preflight', async (t) => {
  const base = await serve(t, '*');
  for (const origin of ['https://frontend.example', 'http://localhost:5173']) {
    const response = await fetch(`${base}/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    assert.equal(response.headers.get('access-control-expose-headers'), 'Location');
  }
  const response = await fetch(`${base}/api/cash-transactions/1`, {
    method: 'OPTIONS', headers: {
      Origin: 'https://frontend.example',
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-methods'), /PATCH/);
  assert.equal(response.headers.get('access-control-allow-headers'), 'content-type,authorization');
  const missing = await fetch(`${base}/missing`, { headers: { Origin: 'https://frontend.example' } });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('access-control-allow-origin'), '*');
});

test('allowlist permits exact origins, not subdomains or other ports', async (t) => {
  const base = await serve(t, ' https://frontend.example, http://localhost:5173 ');
  for (const origin of ['https://frontend.example', 'http://localhost:5173', 'https://other.example', 'https://sub.frontend.example', 'http://localhost:5174']) {
    const response = await fetch(`${base}/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    const allowed = ['https://frontend.example', 'http://localhost:5173'].includes(origin);
    assert.equal(response.headers.get('access-control-allow-origin'), allowed ? origin : null);
    assert.match(response.headers.get('vary'), /Origin/);
  }
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('empty config disables cross-origin permission', async (t) => {
  const base = await serve(t, '');
  const response = await fetch(`${base}/health`, { headers: { Origin: 'https://frontend.example' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('rejects invalid origins and mixed wildcard configurations', () => {
  for (const value of ['*,https://frontend.example', 'example.com', 'https://frontend.example/', 'https://frontend.example/path', 'null']) {
    assert.throws(() => createCorsOptions(value), /CORS_ORIGINS/);
  }
});