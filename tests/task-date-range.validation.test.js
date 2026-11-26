const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listTasksQuerySchema, taskStatsQuerySchema } = require('../src/modules/tasks/task.validation');

test('list and stats queries accept valid inclusive date ranges', () => {
  const range = { dateFrom: '2032-05-01', dateTo: '2032-05-31' };

  assert.equal(listTasksQuerySchema.safeParse(range).success, true);
  assert.equal(taskStatsQuerySchema.safeParse(range).success, true);
});

test('date range queries reject impossible dates and reversed ranges', () => {
  assert.equal(taskStatsQuerySchema.safeParse({
    dateFrom: '2032-02-30',
    dateTo: '2032-03-01',
  }).success, false);

  const reversed = listTasksQuerySchema.safeParse({
    dateFrom: '2032-05-02',
    dateTo: '2032-05-01',
  });
  assert.equal(reversed.success, false);
  assert.ok(reversed.error.issues.some((issue) => issue.path.includes('dateTo')));
});

test('date range queries can filter from a single boundary', () => {
  const result = listTasksQuerySchema.safeParse({ dateFrom: '2032-05-01' });
  assert.equal(result.success, true);
  assert.equal(result.data.dateTo, undefined);
});
