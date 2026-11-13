import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

test('GET /fees answers with the fee as JSON', async () => {
  const res = await fetch(`${baseUrl}/fees?due=2024-03-01&returned=2024-03-03`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await res.json(), { feeCents: 50 });
});

test('GET /fees answers 400 when the return date is missing', async () => {
  const res = await fetch(`${baseUrl}/fees?due=2024-03-01`);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /returned/);
});

test('GET /fees caps the fee for a long-overdue book', async () => {
  const res = await fetch(`${baseUrl}/fees?due=2024-01-01&returned=2024-03-01`);
  assert.deepEqual(await res.json(), { feeCents: 500 });
});
