const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checklistItemParamSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
} = require('../../../src/modules/tasks/task.validation');

test('checklist item creation trims and validates titles', () => {
  assert.deepEqual(createChecklistItemSchema.parse({ title: '  Review draft  ' }), {
    title: 'Review draft',
  });
  assert.equal(createChecklistItemSchema.safeParse({ title: '   ' }).success, false);
  assert.equal(createChecklistItemSchema.safeParse({ title: 'a'.repeat(201) }).success, false);
});

test('checklist item updates require a supported change', () => {
  assert.deepEqual(updateChecklistItemSchema.parse({ isCompleted: true }), { isCompleted: true });
  assert.equal(updateChecklistItemSchema.safeParse({}).success, false);
  assert.equal(updateChecklistItemSchema.safeParse({ is_completed: true }).success, false);
});

test('checklist routes validate both task and item ids', () => {
  assert.equal(
    checklistItemParamSchema.safeParse({
      id: '0123456789abcdef01234567',
      itemId: 'abcdef0123456789abcdef01',
    }).success,
    true,
  );
  assert.equal(
    checklistItemParamSchema.safeParse({
      id: 'not-an-object-id',
      itemId: 'abcdef0123456789abcdef01',
    }).success,
    false,
  );
});
