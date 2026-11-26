const { test } = require('node:test');
const assert = require('node:assert/strict');
const Task = require('../src/modules/tasks/task.model');
const { createTaskSchema } = require('../src/modules/tasks/task.validation');

test('task creation accepts checklist items with optional completion state', () => {
  const result = createTaskSchema.safeParse({
    title: 'Release checklist',
    checklistItems: [
      { title: 'Prepare notes' },
      { title: 'Verify build', isCompleted: true },
    ],
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data.checklistItems, [
    { title: 'Prepare notes' },
    { title: 'Verify build', isCompleted: true },
  ]);
});

test('task creation rejects blank and excessive checklist items', () => {
  const blankTitle = createTaskSchema.safeParse({
    title: 'Task',
    checklistItems: [{ title: '  ' }],
  });
  const tooManyItems = createTaskSchema.safeParse({
    title: 'Task',
    checklistItems: Array.from({ length: 101 }, (_, index) => ({ title: `Step ${index}` })),
  });

  assert.equal(blankTitle.success, false);
  assert.equal(tooManyItems.success, false);
});

test('task serialization exposes a display-ready sequential task code', () => {
  const numberedTask = new Task({ title: 'Task', taskNumber: 42 });
  const legacyTask = new Task({ title: 'Legacy task' });

  assert.equal(numberedTask.toJSON().taskCode, 'TK-000042');
  assert.equal(legacyTask.toJSON().taskCode, undefined);
});
