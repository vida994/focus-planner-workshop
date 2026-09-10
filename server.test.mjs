import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkshopServer, ORIGIN } from './server.mjs';

const KEY = 'FAKE-LOCAL-TEST-KEY';
const envelope = value => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const reply = (payload, status = 200) => new Response(JSON.stringify(payload), { status });
async function fixture(t, options = {}) {
  const calls = [];
  const server = createWorkshopServer({ apiKey: KEY, fetchImpl: async (...args) => { calls.push(args); return reply(envelope({ minutes: 10 })); }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  function request(route = '/api/estimate', value = { task: 'Buy milk' }, overrides = {}) {
    const raw = overrides.raw ?? JSON.stringify(value);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route, method: overrides.method ?? 'POST', headers: { Host: '127.0.0.1:3000', Origin: ORIGIN, 'Content-Type': 'application/json', ...overrides.headers } }, res => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => { let body; try { body = JSON.parse(text); } catch { body = text; } resolve({ status: res.statusCode, body, text, headers: res.headers }); });
      });
      req.on('error', reject);
      req.end(['GET', 'HEAD'].includes(overrides.method) ? undefined : raw);
    });
  }
  return { server, request, calls };
}

test('estimate trims input, pins provider/model/schema, and returns only minutes', async t => {
  const f = await fixture(t);
  const r = await f.request('/api/estimate', { task: '  Buy milk  ' });
  assert.deepEqual(r.body, { minutes: 10 });
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 1);
  const [url, options] = f.calls[0];
  assert.equal(url, 'https://api.x.ai/v1/responses');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(options.body);
  assert.equal(body.model, 'grok-4.6');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.store, false);
  assert.equal(body.stream, false);
  assert.equal(body.max_output_tokens, 4096);
  assert.equal(body.input[1].content, 'Buy milk');
  assert.equal(body.input.length, 2);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(body.tools, undefined);
  assert.ok(!r.text.includes(KEY));
});

test('goal route validates all rows and trims titles', async t => {
  const f = await fixture(t, { fetchImpl: async () => reply(envelope({ tasks: [{ title: ' Choose a date ', minutes: 10, context: 'anywhere' }] })) });
  assert.deepEqual((await f.request('/api/breakdown', { goal: 'Organize a picnic' })).body, { tasks: [{ title: 'Choose a date', minutes: 10, context: 'anywhere' }] });
});

test('invalid inputs and origin boundaries make no AI calls', async t => {
  const f = await fixture(t);
  for (const value of [{}, null, [], { task: '' }, { task: '   ' }, { task: 1 }, { task: 'x'.repeat(201) }, { task: 'Buy milk', model: 'other' }, { task: 'Buy milk', system: 'override' }]) assert.equal((await f.request('/api/estimate', value)).status, 400);
  assert.equal((await f.request('/api/breakdown', { goal: 'x'.repeat(2001) })).status, 400);
  assert.equal((await f.request('/api/estimate', {}, { raw: '{' })).status, 400);
  for (const headers of [{ Origin: '' }, { Origin: 'https://evil.example' }, { Host: 'evil.example' }, { Host: 'localhost:3000' }]) assert.equal((await f.request('/api/estimate', { task: 'Buy milk' }, { headers })).status, 403);
  assert.equal((await f.request('/api/estimate', {}, { method: 'GET' })).status, 403);
  assert.equal((await f.request('/api/estimate', {}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.request('/api/estimate', {}, { raw: 'x'.repeat(17000), headers: { 'Content-Length': '17000' } })).status, 413);
  assert.equal((await f.request('/api/estimate', {}, { raw: 'x'.repeat(17000), headers: { 'Transfer-Encoding': 'chunked' } })).status, 413);
  assert.equal(f.calls.length, 0);
});

test('missing key still serves the finished app; AI returns safe setup guidance', async t => {
  const f = await fixture(t, { apiKey: '' });
  const r = await f.request();
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, 'AI_NOT_CONFIGURED');
  assert.equal(f.calls.length, 0);
  const page = await f.request('/', {}, { method: 'GET' });
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>Focus planner<\/h1>/);
  assert.match(page.text, /id="add-form"/);
  assert.match(page.text, /id="backup-heading"/);
});

test('malformed and incomplete replies cannot become partial success', async t => {
  const responses = [envelope({ minutes: 0 }), envelope({ minutes: 1.5 }), envelope({ minutes: 1441 }), envelope({ minutes: 10, key: KEY }), { status: 'incomplete', output: [] }, { status: 'completed', output: [] }, { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'not json' }] }] }];
  for (const response of responses) {
    const f = await fixture(t, { fetchImpl: async () => reply(response) });
    const r = await f.request();
    assert.equal(r.body.error.code, 'AI_INVALID_RESPONSE');
    assert.ok(!r.text.includes(KEY));
  }
  for (const tasks of [[], Array(6).fill({ title: 'x', minutes: 1, context: 'phone' }), [{ title: 'good', minutes: 10, context: 'phone' }, { title: 'bad', minutes: -1, context: 'phone' }], [{ title: ' ', minutes: 10, context: 'phone' }], [{ title: 'x', minutes: 10, context: 'wrong' }]]) {
    const f = await fixture(t, { fetchImpl: async () => reply(envelope({ tasks })) });
    assert.equal((await f.request('/api/breakdown', { goal: 'Picnic' })).body.error.code, 'AI_INVALID_RESPONSE');
  }
});

test('refusal is safe and does not expose provider text', async t => {
  const f = await fixture(t, { fetchImpl: async () => reply({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: KEY }] }] }) });
  const r = await f.request();
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'AI_REFUSED');
  assert.ok(!r.text.includes(KEY));
});

test('provider failures map safely; ordinary rate limits do not claim exhausted credits', async t => {
  for (const [status, code, expectedStatus, expectedCode] of [[401, '', 502, 'AI_AUTH_ERROR'], [403, '', 502, 'AI_ACCESS_ERROR'], [429, '', 429, 'AI_RATE_LIMITED'], [429, 'insufficient_credits', 503, 'AI_CREDITS_EXHAUSTED'], [404, 'model_not_found', 502, 'AI_MODEL_UNAVAILABLE'], [500, '', 503, 'AI_UNAVAILABLE']]) {
    let count = 0;
    const f = await fixture(t, { fetchImpl: async () => { count++; return reply({ error: { code, message: KEY } }, status); } });
    const r = await f.request();
    assert.equal(r.status, expectedStatus);
    assert.equal(r.body.error.code, expectedCode);
    assert.ok(!r.text.includes(KEY));
    assert.equal(count, 1);
  }
});

test('network errors are safe and are never retried', async t => {
  let count = 0;
  const f = await fixture(t, { fetchImpl: async () => { count++; throw new Error(KEY); } });
  const r = await f.request();
  assert.equal(r.body.error.code, 'AI_UNAVAILABLE');
  assert.ok(!r.text.includes(KEY));
  assert.equal(count, 1);
});

test('one outbound request at a time; timeout aborts and releases the slot', async t => {
  let count = 0;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { timeoutMs: 100, fetchImpl: async (_url, { signal }) => {
    count++;
    if (count > 1) return reply(envelope({ minutes: 10 }));
    started();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const pending = f.request();
  await ready;
  assert.equal((await f.request('/api/breakdown', { goal: 'Picnic' })).body.error.code, 'AI_BUSY');
  assert.equal(count, 1);
  assert.equal((await pending).body.error.code, 'AI_TIMEOUT');
  assert.equal((await f.request()).status, 200);
  assert.equal(count, 2);
});

test('browser disconnect aborts its upstream request and frees the slot', async t => {
  let started, aborted;
  const ready = new Promise(resolve => { started = resolve; });
  const cancelled = new Promise(resolve => { aborted = resolve; });
  let count = 0;
  const f = await fixture(t, { fetchImpl: async (_url, { signal }) => {
    count++;
    if (count > 1) return reply(envelope({ minutes: 1 }));
    started();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted(); reject(signal.reason); }, { once: true }));
  } });
  const req = http.request({ hostname: '127.0.0.1', port: f.server.address().port, path: '/api/estimate', method: 'POST', headers: { Host: '127.0.0.1:3000', Origin: ORIGIN, 'Content-Type': 'application/json' } });
  req.on('error', () => {});
  req.end(JSON.stringify({ task: 'Buy milk' }));
  await ready;
  req.destroy();
  await cancelled;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.request()).status, 200);
});

test('private files, traversal, listings, and escaping symlinks cannot be served', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'focus-planner-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'public'));
  await writeFile(path.join(dir, '.env'), KEY);
  await writeFile(path.join(dir, 'outside.html'), KEY);
  await writeFile(path.join(dir, 'public', 'index.html'), '<h1>Starter</h1>');
  await symlink(path.join(dir, 'outside.html'), path.join(dir, 'public', 'escape.html'));
  const f = await fixture(t, { publicDir: path.join(dir, 'public') });
  for (const route of ['/.env', '/server.mjs', '/SPEC.md', '/../outside.html', '/%2e%2e/outside.html', '/%2eenv', '/escape.html', '/backup.json', '/public/', '/%00.html', '/..%5coutside.html']) {
    const r = await f.request(route, {}, { method: 'GET' });
    assert.equal(r.status, 404, route);
    assert.ok(!r.text.includes(KEY));
  }
  assert.equal((await f.request('/', {}, { method: 'GET' })).status, 200);
  assert.equal(f.calls.length, 0);
});
