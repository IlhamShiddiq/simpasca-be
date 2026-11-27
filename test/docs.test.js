import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openapi } from '../src/docs/openapi.js';
import { modules } from './helpers/modules.js';
import { authOptions } from './helpers/auth.js';

test('Swagger UI, local assets and OpenAPI JSON are accessible without database queries', async (t) => {
  const server = createApp({ query: async () => { throw new Error('Docs must not query database'); } }, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/docs/api`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /swagger-ui/);
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
    const asset = await fetch(`${base}/docs/api/${file}`);
    assert.equal(asset.status, 200, file);
    if (file === 'swagger-ui-init.js') assert.match(await asset.text(), /SIMPASCA API/);
  }
  const spec = await fetch(`${base}/docs/api/openapi.json`);
  assert.equal(spec.status, 200);
  assert.match(spec.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await spec.json(), openapi);
});

test('OpenAPI covers all API operations and resolves internal schema references', () => {
  const operations = Object.values(openapi.paths).flatMap((path) =>
    Object.keys(path).filter((key) => ['get', 'post', 'patch', 'delete'].includes(key)));
  const operationsOf = (resource) => (resource.readOnly ? 2 : resource.appendOnly ? 3 : 5);
  assert.equal(operations.length, 10 + modules.reduce((total, resource) => total + operationsOf(resource), 0));
  for (const resource of modules) {
    assert.equal(Boolean(openapi.paths[`/api/${resource.path}`].post), !resource.readOnly);
    assert.ok(openapi.paths[`/api/${resource.path}/{id}`].get);
    assert.equal(Boolean(openapi.paths[`/api/${resource.path}/{id}`].patch), !resource.appendOnly && !resource.readOnly);
  }
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const target = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key], openapi);
      assert.ok(target, `Unresolved reference: ${value.$ref}`);
    }
    Object.values(value).forEach(visit);
  };
  visit(openapi);
  assert.equal(openapi.servers[0].url, '/');
  assert.deepEqual(openapi.security, [{ bearerAuth: [] }]);
  assert.equal(openapi.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.deepEqual(openapi.paths['/api/auth/login'].post.security, []);
  assert.deepEqual(openapi.paths['/health'].get.security, []);
  assert.equal(openapi.components.schemas.UpdateCashTransaction.additionalProperties, false);
  assert.equal(openapi.paths['/api/cash-transactions/{id}'].delete.responses[204].content, undefined);
});