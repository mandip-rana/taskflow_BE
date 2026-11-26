const taskService = require('./task.service');
const asyncHandler = require('../../shared/utils/asyncHandler');
const { sendSuccess } = require('../../shared/utils/apiResponse');
const { CREATED } = require('../../shared/constants/http');

const getTasks = asyncHandler(async (req, res) => {
  const { tasks, meta } = await taskService.getTasks(req.validated.query);
  sendSuccess(res, { data: tasks, meta });
});

const getTaskStats = asyncHandler(async (req, res) => {
  const stats = await taskService.getTaskStats(req.validated.query);
  sendSuccess(res, { data: stats });
});

const getTaskById = asyncHandler(async (req, res) => {
  const task = await taskService.getTaskById(req.validated.params.id);
  sendSuccess(res, { data: task });
});

const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(req.validated.body);
  sendSuccess(res, { statusCode: CREATED, message: 'Task created successfully', data: task });
});

const createChecklistItem = asyncHandler(async (req, res) => {
  const task = await taskService.createChecklistItem(req.validated.params.id, req.validated.body);
  sendSuccess(res, { statusCode: CREATED, message: 'Checklist item created successfully', data: task });
});

const updateChecklistItem = asyncHandler(async (req, res) => {
  const task = await taskService.updateChecklistItem(
    req.validated.params.id,
    req.validated.params.itemId,
    req.validated.body,
  );
  sendSuccess(res, { message: 'Checklist item updated successfully', data: task });
});

const deleteChecklistItem = asyncHandler(async (req, res) => {
  const task = await taskService.deleteChecklistItem(req.validated.params.id, req.validated.params.itemId);
  sendSuccess(res, { message: 'Checklist item deleted successfully', data: task });
});

const updateTask = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(req.validated.params.id, req.validated.body);
  sendSuccess(res, { message: 'Task updated successfully', data: task });
});

const updateTaskStatus = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskStatus(
    req.validated.params.id,
    req.validated.body.status,
  );
  sendSuccess(res, { message: 'Task status updated successfully', data: task });
});

const deleteTask = asyncHandler(async (req, res) => {
  const task = await taskService.deleteTask(req.validated.params.id);
  sendSuccess(res, { message: 'Task deleted successfully', data: { id: task.id } });
});

module.exports = {
  getTasks,
  getTaskStats,
  getTaskById,
  createTask,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  updateTask,
  updateTaskStatus,
  deleteTask,
};
