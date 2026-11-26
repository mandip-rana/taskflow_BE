/**
 * Integration tests: run the real Express app against a real MongoDB.
 * Requires MongoDB (default mongodb://127.0.0.1:27017/taskflow_test).
 * Override with MONGODB_TEST_URI. The test database is dropped afterwards.
 */
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '100000';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const Task = require('../src/modules/tasks/task.model');
const TaskCounter = require('../src/modules/tasks/task-counter.model');

const TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/taskflow_test';
const MISSING_ID = '64b7f0f0f0f0f0f0f0f0f0f0';
const DAY_MS = 24 * 60 * 60 * 1000;

let server;
let baseUrl;

const request = async (method, path, body) => {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
};

const createTask = async (payload) => {
  const res = await request('POST', '/tasks', payload);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

const createTaskAt = (title, createdAt, status = 'todo') => {
  const timestamp = new Date(createdAt);
  return Task.create({ title, status, createdAt: timestamp, updatedAt: timestamp });
};

before(async () => {
  await connectDB(TEST_URI);
  await Task.init(); // make sure indexes exist
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([Task.deleteMany({}), TaskCounter.deleteMany({})]);
});

describe('GET /health', () => {
  test('reports ok with database connected', async () => {
    const res = await request('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
    assert.equal(res.body.data.database, 'connected');
  });
});

describe('POST /tasks', () => {
  test('creates a task with defaults and persists it', async () => {
    const task = await createTask({ title: '  Write report  ' });
    assert.equal(task.title, 'Write report');
    assert.equal(task.description, '');
    assert.equal(task.status, 'todo');
    assert.equal(task.priority, 'medium');
    assert.equal(task.dueDate, null);
    assert.ok(task.id && task.createdAt && task.updatedAt);
    assert.equal(task._id, undefined);
    assert.equal(task.__v, undefined);

    const stored = await Task.findById(task.id);
    assert.equal(stored.title, 'Write report');
  });

  test('creates a task with all fields', async () => {
    const task = await createTask({
      title: 'Ship',
      description: 'Release v1',
      status: 'in_progress',
      priority: 'critical',
      dueDate: '2030-01-15',
    });
    assert.equal(task.status, 'in_progress');
    assert.equal(task.priority, 'critical');
    assert.equal(task.dueDate, '2030-01-15T00:00:00.000Z');
  });

  test('assigns sequential task codes and accepts checklist items on creation', async () => {
    const first = await createTask({
      title: 'First task',
      checklistItems: [
        { title: 'Prepare draft' },
        { title: 'Review draft', isCompleted: true },
      ],
    });
    const second = await createTask({ title: 'Second task' });

    assert.equal(first.taskNumber, 1);
    assert.equal(first.taskCode, 'TK-000001');
    assert.deepEqual(first.checklistItems.map((item) => item.sortOrder), [0, 1]);
    assert.deepEqual(first.checklistItems.map((item) => item.isCompleted), [false, true]);
    assert.equal(second.taskCode, 'TK-000002');
  });

  test('rejects invalid initial checklist items', async () => {
    const blankItem = await request('POST', '/tasks', {
      title: 'Task',
      checklistItems: [{ title: '  ' }],
    });
    assert.equal(blankItem.status, 400);

    const tooManyItems = await request('POST', '/tasks', {
      title: 'Task',
      checklistItems: Array.from({ length: 101 }, (_, index) => ({ title: `Step ${index}` })),
    });
    assert.equal(tooManyItems.status, 400);
  });

  test('rejects missing / blank title', async () => {
    for (const body of [{}, { title: '   ' }, { title: 123 }]) {
      const res = await request('POST', '/tasks', body);
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, 'Validation failed');
      assert.ok(res.body.errors.some((e) => e.field === 'title'));
    }
  });

  test('rejects invalid status, priority and dueDate', async () => {
    const res = await request('POST', '/tasks', {
      title: 'x',
      status: 'done',
      priority: 'urgent',
      dueDate: 'tomorrow',
    });
    assert.equal(res.status, 400);
    const fields = res.body.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ['dueDate', 'priority', 'status']);
    assert.equal(await Task.countDocuments(), 0);
  });

  test('rejects impossible calendar dates', async () => {
    const res = await request('POST', '/tasks', { title: 'x', dueDate: '2026-13-45' });
    assert.equal(res.status, 400);
  });

  test('rejects unknown fields and over-long values', async () => {
    const unknown = await request('POST', '/tasks', { title: 'x', _id: MISSING_ID, foo: 1 });
    assert.equal(unknown.status, 400);
    const long = await request('POST', '/tasks', { title: 'a'.repeat(201) });
    assert.equal(long.status, 400);
  });

  test('rejects malformed JSON with 400 and no internals', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title": ',
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.message, 'Request body contains invalid JSON');
    assert.equal(body.stack, undefined);
  });

  test('rejects oversized payloads with 413', async () => {
    const res = await request('POST', '/tasks', { title: 'x', description: 'a'.repeat(200000) });
    assert.equal(res.status, 413);
  });
});

describe('GET /tasks/:id', () => {
  test('returns a task', async () => {
    const created = await createTask({ title: 'Find me' });
    const res = await request('GET', `/tasks/${created.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, created.id);
  });

  test('404 for a missing task', async () => {
    const res = await request('GET', `/tasks/${MISSING_ID}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Task not found');
  });

  test('400 for an invalid ObjectId', async () => {
    for (const id of ['abc', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '123456789012']) {
      const res = await request('GET', `/tasks/${id}`);
      assert.equal(res.status, 400, id);
      assert.equal(res.body.errors[0].field, 'id');
    }
  });
});

describe('PATCH /tasks/:id', () => {
  test('updates fields and persists them', async () => {
    const created = await createTask({ title: 'Old', priority: 'low' });
    const res = await request('PATCH', `/tasks/${created.id}`, {
      title: 'New',
      description: 'Updated',
      priority: 'high',
      dueDate: '2031-05-01',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.title, 'New');
    assert.equal(res.body.data.priority, 'high');

    const stored = await Task.findById(created.id).lean();
    assert.equal(stored.title, 'New');
    assert.equal(stored.description, 'Updated');
    assert.equal(stored.dueDate.toISOString(), '2031-05-01T00:00:00.000Z');
    assert.ok(stored.updatedAt > stored.createdAt || +stored.updatedAt >= +stored.createdAt);
  });

  test('can clear dueDate with null and leaves other fields alone', async () => {
    const created = await createTask({ title: 'Keep', dueDate: '2031-05-01', priority: 'high' });
    const res = await request('PATCH', `/tasks/${created.id}`, { dueDate: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.dueDate, null);
    assert.equal(res.body.data.title, 'Keep');
    assert.equal(res.body.data.priority, 'high');
  });

  test('rejects empty body, invalid values, unknown fields', async () => {
    const created = await createTask({ title: 'T' });
    assert.equal((await request('PATCH', `/tasks/${created.id}`, {})).status, 400);
    assert.equal((await request('PATCH', `/tasks/${created.id}`, { title: '' })).status, 400);
    assert.equal((await request('PATCH', `/tasks/${created.id}`, { status: 'nope' })).status, 400);
    assert.equal((await request('PATCH', `/tasks/${created.id}`, { id: 'x' })).status, 400);
    const stored = await Task.findById(created.id);
    assert.equal(stored.title, 'T');
  });

  test('404 for missing, 400 for invalid id', async () => {
    assert.equal((await request('PATCH', `/tasks/${MISSING_ID}`, { title: 'x' })).status, 404);
    assert.equal((await request('PATCH', '/tasks/not-an-id', { title: 'x' })).status, 400);
  });
});

describe('PATCH /tasks/:id/status', () => {
  test('changes status and persists it', async () => {
    const created = await createTask({ title: 'Move me' });
    for (const status of ['in_progress', 'completed', 'cancelled', 'todo']) {
      const res = await request('PATCH', `/tasks/${created.id}/status`, { status });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, status);
      assert.equal((await Task.findById(created.id)).status, status);
    }
  });

  test('rejects invalid / missing status and extra fields', async () => {
    const created = await createTask({ title: 'T' });
    assert.equal((await request('PATCH', `/tasks/${created.id}/status`, { status: 'done' })).status, 400);
    assert.equal((await request('PATCH', `/tasks/${created.id}/status`, {})).status, 400);
    assert.equal(
      (await request('PATCH', `/tasks/${created.id}/status`, { status: 'todo', title: 'x' })).status,
      400,
    );
    assert.equal((await Task.findById(created.id)).status, 'todo');
  });

  test('404 for missing, 400 for invalid id', async () => {
    assert.equal((await request('PATCH', `/tasks/${MISSING_ID}/status`, { status: 'todo' })).status, 404);
    assert.equal((await request('PATCH', '/tasks/abc/status', { status: 'todo' })).status, 400);
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes a task permanently', async () => {
    const created = await createTask({ title: 'Delete me' });
    const res = await request('DELETE', `/tasks/${created.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, created.id);
    assert.equal(await Task.findById(created.id), null);
    assert.equal((await request('GET', `/tasks/${created.id}`)).status, 404);
    assert.equal((await request('DELETE', `/tasks/${created.id}`)).status, 404);
  });

  test('400 for invalid id', async () => {
    assert.equal((await request('DELETE', '/tasks/abc')).status, 400);
  });
});

describe('GET /tasks (list)', () => {
  const seed = async () => {
    const now = Date.now();
    // Sequential so createdAt ordering is deterministic.
    const a = await createTask({ title: 'Alpha design', description: 'Landing page', priority: 'low', dueDate: new Date(now + 3 * DAY_MS).toISOString() });
    const b = await createTask({ title: 'Beta build', description: 'API for the DESIGN system', priority: 'high', status: 'in_progress', dueDate: new Date(now + 1 * DAY_MS).toISOString() });
    const c = await createTask({ title: 'Gamma ship', priority: 'critical', status: 'completed' });
    const d = await createTask({ title: 'Delta (test) [1]', priority: 'high', status: 'cancelled', dueDate: new Date(now + 5 * DAY_MS).toISOString() });
    return { a, b, c, d };
  };

  test('empty database returns an empty page', async () => {
    const res = await request('GET', '/tasks');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.deepEqual(res.body.meta, { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false });
  });

  test('defaults: newest first, paginated meta', async () => {
    const { a, b, c, d } = await seed();
    const res = await request('GET', '/tasks');
    assert.deepEqual(res.body.data.map((t) => t.id), [d.id, c.id, b.id, a.id]);
    assert.equal(res.body.meta.total, 4);
  });

  test('pagination', async () => {
    const { a, b, c, d } = await seed();
    const p1 = await request('GET', '/tasks?limit=3&page=1');
    assert.deepEqual(p1.body.data.map((t) => t.id), [d.id, c.id, b.id]);
    assert.deepEqual(p1.body.meta, { page: 1, limit: 3, total: 4, totalPages: 2, hasNextPage: true, hasPrevPage: false });
    const p2 = await request('GET', '/tasks?limit=3&page=2');
    assert.deepEqual(p2.body.data.map((t) => t.id), [a.id]);
    assert.equal(p2.body.meta.hasNextPage, false);
    assert.equal(p2.body.meta.hasPrevPage, true);
    const p9 = await request('GET', '/tasks?limit=3&page=9');
    assert.deepEqual(p9.body.data, []);
  });

  test('rejects invalid pagination values', async () => {
    for (const qs of ['page=0', 'page=-1', 'page=abc', 'page=1.5', 'limit=0', 'limit=101', 'limit=abc']) {
      const res = await request('GET', `/tasks?${qs}`);
      assert.equal(res.status, 400, qs);
    }
  });

  test('filters by status and priority (and both)', async () => {
    const { b, c, d } = await seed();
    const byStatus = await request('GET', '/tasks?status=in_progress');
    assert.deepEqual(byStatus.body.data.map((t) => t.id), [b.id]);
    const byPriority = await request('GET', '/tasks?priority=high');
    assert.deepEqual(byPriority.body.data.map((t) => t.id), [d.id, b.id]);
    const both = await request('GET', '/tasks?priority=high&status=cancelled');
    assert.deepEqual(both.body.data.map((t) => t.id), [d.id]);
    assert.equal(both.body.meta.total, 1);
    const completed = await request('GET', '/tasks?status=completed');
    assert.deepEqual(completed.body.data.map((t) => t.id), [c.id]);
  });

  test('filters by an inclusive created-date range', async () => {
    await createTaskAt('Before range', '2032-05-03T23:59:59.999Z');
    await createTaskAt('Range start', '2032-05-04T00:00:00.000Z');
    await createTaskAt('Range end', '2032-05-04T23:59:59.999Z');
    await createTaskAt('After range', '2032-05-05T00:00:00.000Z');

    const res = await request('GET', '/tasks?dateFrom=2032-05-04&dateTo=2032-05-04');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((task) => task.title).sort(), ['Range end', 'Range start']);
    assert.equal(res.body.meta.total, 2);
  });

  test('rejects invalid filter and sort values', async () => {
    for (const qs of [
      'status=done',
      'priority=urgent',
      'sortBy=title',
      'order=up',
      'dateFrom=2032-02-30',
      'dateFrom=2032-05-05&dateTo=2032-05-04',
    ]) {
      assert.equal((await request('GET', `/tasks?${qs}`)).status, 400, qs);
    }
  });

  test('search matches title and description, case-insensitively', async () => {
    const { a, b } = await seed();
    const res = await request('GET', '/tasks?search=design');
    assert.deepEqual(res.body.data.map((t) => t.id).sort(), [a.id, b.id].sort());
    const partial = await request('GET', '/tasks?search=LANDING');
    assert.deepEqual(partial.body.data.map((t) => t.id), [a.id]);
    const none = await request('GET', '/tasks?search=zzz');
    assert.equal(none.body.meta.total, 0);
  });

  test('search treats regex characters literally and combines with filters', async () => {
    const { d } = await seed();
    const special = await request('GET', `/tasks?search=${encodeURIComponent('(test) [1]')}`);
    assert.deepEqual(special.body.data.map((t) => t.id), [d.id]);
    const dot = await request('GET', `/tasks?search=${encodeURIComponent('.*')}`);
    assert.equal(dot.body.meta.total, 0);
    const combined = await request('GET', '/tasks?search=design&priority=high');
    assert.equal(combined.body.meta.total, 1);
    const blank = await request('GET', '/tasks?search=%20%20');
    assert.equal(blank.body.meta.total, 4);
  });

  test('sorts by createdAt asc/desc', async () => {
    const { a, b, c, d } = await seed();
    const asc = await request('GET', '/tasks?sortBy=createdAt&order=asc');
    assert.deepEqual(asc.body.data.map((t) => t.id), [a.id, b.id, c.id, d.id]);
    const desc = await request('GET', '/tasks?sortBy=createdAt&order=desc');
    assert.deepEqual(desc.body.data.map((t) => t.id), [d.id, c.id, b.id, a.id]);
  });

  test('sorts by dueDate with tasks lacking a due date always last', async () => {
    const { a, b, c, d } = await seed();
    const asc = await request('GET', '/tasks?sortBy=dueDate&order=asc');
    assert.deepEqual(asc.body.data.map((t) => t.id), [b.id, a.id, d.id, c.id]);
    const desc = await request('GET', '/tasks?sortBy=dueDate&order=desc');
    assert.deepEqual(desc.body.data.map((t) => t.id), [d.id, a.id, b.id, c.id]);
  });

  test('dueDate sort works with filters, search and pagination, and returns clean JSON', async () => {
    const { a, b } = await seed();
    const res = await request('GET', '/tasks?sortBy=dueDate&order=asc&search=design&limit=1&page=2');
    assert.deepEqual(res.body.data.map((t) => t.id), [a.id]);
    assert.equal(res.body.meta.total, 2);
    const first = (await request('GET', '/tasks?sortBy=dueDate&order=asc&limit=1')).body.data[0];
    assert.equal(first.id, b.id);
    assert.equal(first._id, undefined);
    assert.equal(first._noDueDate, undefined);
    assert.equal(first.__v, undefined);
  });
});

describe('GET /tasks/stats', () => {
  test('zero-filled stats for an empty database (not captured by /:id)', async () => {
    const res = await request('GET', '/tasks/stats');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      total: 0,
      byStatus: { todo: 0, in_progress: 0, completed: 0, cancelled: 0 },
      byPriority: { low: 0, medium: 0, high: 0, critical: 0 },
      overdue: 0,
      dueSoon: 0,
      completionRate: 0,
    });
  });

  test('aggregates counts, overdue, due soon and completion rate', async () => {
    const now = Date.now();
    const iso = (offsetDays) => new Date(now + offsetDays * DAY_MS).toISOString();
    await createTask({ title: '1', status: 'todo', priority: 'low', dueDate: iso(-2) }); // overdue
    await createTask({ title: '2', status: 'in_progress', priority: 'high', dueDate: iso(-1) }); // overdue
    await createTask({ title: '3', status: 'completed', priority: 'high', dueDate: iso(-5) }); // not overdue (done)
    await createTask({ title: '4', status: 'cancelled', priority: 'critical', dueDate: iso(-5) }); // not overdue
    await createTask({ title: '5', status: 'todo', priority: 'medium', dueDate: iso(2) }); // due soon
    await createTask({ title: '6', status: 'todo', priority: 'medium', dueDate: iso(30) }); // later
    await createTask({ title: '7', status: 'completed', priority: 'low' });

    const { body } = await request('GET', '/tasks/stats');
    assert.equal(body.data.total, 7);
    assert.deepEqual(body.data.byStatus, { todo: 3, in_progress: 1, completed: 2, cancelled: 1 });
    assert.deepEqual(body.data.byPriority, { low: 2, medium: 2, high: 2, critical: 1 });
    assert.equal(body.data.overdue, 2);
    assert.equal(body.data.dueSoon, 1);
    assert.equal(body.data.completionRate, 33); // 2 / (7 - 1 cancelled)
  });

  test('scopes KPI statistics by the inclusive created-date range', async () => {
    await createTaskAt('Outside range', '2032-04-30T23:59:59.999Z', 'completed');
    await createTaskAt('To do in range', '2032-05-01T00:00:00.000Z', 'todo');
    await createTaskAt('Completed in range', '2032-05-31T23:59:59.999Z', 'completed');
    await createTaskAt('Outside range end', '2032-06-01T00:00:00.000Z', 'in_progress');

    const res = await request('GET', '/tasks/stats?dateFrom=2032-05-01&dateTo=2032-05-31');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    assert.deepEqual(res.body.data.byStatus, { todo: 1, in_progress: 0, completed: 1, cancelled: 0 });
  });

  test('rejects invalid date ranges for stats', async () => {
    const invalidDate = await request('GET', '/tasks/stats?dateFrom=2032-02-30&dateTo=2032-03-01');
    assert.equal(invalidDate.status, 400);
    const reversed = await request('GET', '/tasks/stats?dateFrom=2032-05-02&dateTo=2032-05-01');
    assert.equal(reversed.status, 400);
  });

  test('reflects changes after status updates and deletes', async () => {
    const t = await createTask({ title: 'x' });
    await request('PATCH', `/tasks/${t.id}/status`, { status: 'completed' });
    assert.equal((await request('GET', '/tasks/stats')).body.data.completionRate, 100);
    await request('DELETE', `/tasks/${t.id}`);
    assert.equal((await request('GET', '/tasks/stats')).body.data.total, 0);
  });
});

describe('cross-cutting behaviour', () => {
  test('unknown routes return a JSON 404', async () => {
    const res = await request('GET', '/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    const legacy = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(legacy.status, 404);
  });

  test('unsupported method on a known route is a 404 JSON', async () => {
    const res = await request('PUT', `/tasks/${MISSING_ID}`, { title: 'x' });
    assert.equal(res.status, 404);
  });

  test('security headers are set and x-powered-by is hidden', async () => {
    const res = await request('GET', '/health');
    assert.ok(res.headers.get('x-content-type-options'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('CORS allows the configured origin only', async () => {
    const ok = await fetch(`${baseUrl}/api/v1/health`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const bad = await fetch(`${baseUrl}/api/v1/health`, { headers: { Origin: 'http://evil.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(`${baseUrl}/api/v1/tasks/${MISSING_ID}`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PATCH' },
    });
    assert.match(preflight.headers.get('access-control-allow-methods'), /PATCH/);
  });
});
