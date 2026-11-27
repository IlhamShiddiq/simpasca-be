import test from 'node:test';
import assert from 'node:assert/strict';
import { positiveId, validateBody, validateQuery } from '../src/cash-transactions/validation.js';

const valid = { type: 'income', amount: '100.50', transaction_date: '2026-11-14', request_key: 'donation-001', created_by: 1 };

test('validates create payload and preserves decimal string', () => {
  assert.deepEqual(validateBody(valid), valid);
  assert.equal(validateBody({ ...valid, amount: 100 }).amount, '100');
  assert.deepEqual(validateBody({ ...valid, disaster_id: '3', receipt_id: null }), { ...valid, disaster_id: 3, receipt_id: null });
});

test('rejects missing, invalid, excessive and unknown fields', () => {
  for (const body of [null, [], {}, { ...valid, type: 'other' }, { ...valid, amount: 0 },
    { ...valid, amount: '-1' }, { ...valid, amount: '1.001' }, { ...valid, amount: '10000000000000' },
    { ...valid, amount: true }, { ...valid, transaction_date: '2026-02-30' },
    { ...valid, created_by: 0 }, { ...valid, request_key: ' ' }, { ...valid, unknown: true },
    { ...valid, disaster_id: 0 }, { ...valid, receipt_id: 'x' }]) {
    assert.throws(() => validateBody(body), { status: 422 });
  }
});

test('patch supports partial data but not immutable fields', () => {
  assert.deepEqual(validateBody({ description: null }, true), { description: null });
  assert.deepEqual(validateBody({ disaster_id: null }, true), { disaster_id: null });
  for (const body of [{}, { created_by: 2 }, { request_key: 'changed' }]) {
    assert.throws(() => validateBody(body, true), { status: 422 });
  }
});

test('validates ids, pagination and date filters', () => {
  assert.equal(positiveId('12'), 12);
  assert.deepEqual(validateQuery({}), { page: 1, limit: 20 });
  assert.deepEqual(validateQuery({ disaster_id: '2' }), { page: 1, limit: 20, disaster_id: 2 });
  for (const query of [{ limit: '101' }, { page: '-1' }, { type: ['income', 'expense'] },
    { date_from: '2026-12-01', date_to: '2026-11-01' }, { date_from: '2025-02-29' }, { sort: 'id' }]) {
    assert.throws(() => validateQuery(query), { status: 422 });
  }
});