const express = require('express');
const controller = require('./task.controller');
const validate = require('../../middleware/validate');
const {
  idParamSchema,
  checklistItemParamSchema,
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
  listTasksQuerySchema,
  taskStatsQuerySchema,
} = require('./task.validation');

const router = express.Router();

router.get('/', validate({ query: listTasksQuerySchema }), controller.getTasks);
router.post('/', validate({ body: createTaskSchema }), controller.createTask);

// Must be declared before "/:id" so "stats" is not treated as an id.
router.get('/stats', validate({ query: taskStatsQuerySchema }), controller.getTaskStats);

router.post(
  '/:id/checklist',
  validate({ params: idParamSchema, body: createChecklistItemSchema }),
  controller.createChecklistItem,
);
router.patch(
  '/:id/checklist/:itemId',
  validate({ params: checklistItemParamSchema, body: updateChecklistItemSchema }),
  controller.updateChecklistItem,
);
router.delete(
  '/:id/checklist/:itemId',
  validate({ params: checklistItemParamSchema }),
  controller.deleteChecklistItem,
);

router.get('/:id', validate({ params: idParamSchema }), controller.getTaskById);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateTaskSchema }),
  controller.updateTask,
);
router.patch(
  '/:id/status',
  validate({ params: idParamSchema, body: updateStatusSchema }),
  controller.updateTaskStatus,
);
router.delete('/:id', validate({ params: idParamSchema }), controller.deleteTask);

module.exports = router;
