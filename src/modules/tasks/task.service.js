const Task = require('./task.model');
const TaskCounter = require('./task-counter.model');
const AppError = require('../../shared/utils/AppError');
const escapeRegex = require('../../shared/utils/escapeRegex');
const { buildPaginationMeta } = require('../../shared/utils/pagination');
const { BAD_REQUEST, NOT_FOUND } = require('../../shared/constants/http');
const {
  TASK_STATUS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  ACTIVE_TASK_STATUSES,
  DUE_SOON_DAYS,
  TASK_LIMITS,
} = require('../../shared/constants/task');

const TASK_NOT_FOUND_MESSAGE = 'Task not found';
const DAY_MS = 24 * 60 * 60 * 1000;
const TASK_COUNTER_ID = 'task';

const buildFilter = ({ search, status, priority, dateFrom, dateTo }) => {
  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (dateFrom || dateTo) {
    const createdAt = {};
    if (dateFrom) createdAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) {
      const exclusiveEnd = new Date(`${dateTo}T00:00:00.000Z`);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      createdAt.$lt = exclusiveEnd;
    }
    filter.createdAt = createdAt;
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
  }
  return filter;
};

/**
 * Tasks without a due date always come last when sorting by dueDate,
 * regardless of the sort direction.
 */
const findByDueDate = async (filter, { order, skip, limit }) => {
  const direction = order === 'asc' ? 1 : -1;
  const docs = await Task.aggregate([
    { $match: filter },
    { $addFields: { _noDueDate: { $cond: [{ $eq: [{ $type: '$dueDate' }, 'date'] }, 0, 1] } } },
    { $sort: { _noDueDate: 1, dueDate: direction, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: { _noDueDate: 0 } },
  ]);
  return docs.map((doc) => Task.hydrate(doc));
};

const findByCreatedAt = (filter, { order, skip, limit }) =>
  Task.find(filter)
    .sort({ createdAt: order === 'asc' ? 1 : -1, _id: order === 'asc' ? 1 : -1 })
    .skip(skip)
    .limit(limit);

const getTasks = async (query) => {
  const { page, limit, sortBy, order } = query;
  const filter = buildFilter(query);
  const skip = (page - 1) * limit;
  const find = sortBy === 'dueDate' ? findByDueDate : findByCreatedAt;

  const [tasks, total] = await Promise.all([
    find(filter, { order, skip, limit }),
    Task.countDocuments(filter),
  ]);

  return { tasks, meta: buildPaginationMeta({ page, limit, total }) };
};

const getTaskById = async (id) => {
  const task = await Task.findById(id);
  if (!task) throw new AppError(TASK_NOT_FOUND_MESSAGE, NOT_FOUND);
  return task;
};

const getNextTaskNumber = async () => {
  try {
    const counter = await TaskCounter.findOneAndUpdate(
      { _id: TASK_COUNTER_ID },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true },
    );
    return counter.sequence;
  } catch (error) {
    if (error.code !== 11000) throw error;
    const counter = await TaskCounter.findOneAndUpdate(
      { _id: TASK_COUNTER_ID },
      { $inc: { sequence: 1 } },
      { new: true },
    );
    if (!counter) throw error;
    return counter.sequence;
  }
};

const createTask = async (data) => {
  const { checklistItems = [], ...taskData } = data;
  const taskNumber = await getNextTaskNumber();
  return Task.create({
    ...taskData,
    taskNumber,
    checklistItems: checklistItems.map((item, index) => ({ ...item, sortOrder: index })),
  });
};

const createChecklistItem = async (id, { title }) => {
  const task = await Task.findById(id);
  if (!task) throw new AppError(TASK_NOT_FOUND_MESSAGE, NOT_FOUND);
  if (task.checklistItems.length >= TASK_LIMITS.CHECKLIST_ITEMS_MAX) {
    throw new AppError(
      `A task can have at most ${TASK_LIMITS.CHECKLIST_ITEMS_MAX} checklist items`,
      BAD_REQUEST,
    );
  }

  task.checklistItems.push({ title, sortOrder: task.checklistItems.length });
  await task.save();
  return task;
};

const updateChecklistItem = async (id, itemId, changes) => {
  const task = await Task.findById(id);
  if (!task) throw new AppError(TASK_NOT_FOUND_MESSAGE, NOT_FOUND);
  const item = task.checklistItems.id(itemId);
  if (!item) throw new AppError('Checklist item not found', NOT_FOUND);

  if (changes.title !== undefined) item.title = changes.title;
  if (changes.isCompleted !== undefined) item.isCompleted = changes.isCompleted;
  await task.save();
  return task;
};

const deleteChecklistItem = async (id, itemId) => {
  const task = await Task.findById(id);
  if (!task) throw new AppError(TASK_NOT_FOUND_MESSAGE, NOT_FOUND);
  const item = task.checklistItems.id(itemId);
  if (!item) throw new AppError('Checklist item not found', NOT_FOUND);

  task.checklistItems.pull({ _id: itemId });
  task.checklistItems.forEach((checklistItem, index) => {
    checklistItem.sortOrder = index;
  });
  await task.save();
  return task;
};

/** Shared by the general PATCH and the status-only PATCH. */
const updateTask = async (id, changes) => {
  const task = await Task.findByIdAndUpdate(
    id,
    { $set: changes },
    { returnDocument: 'after', runValidators: true },
  );
  if (!task) throw new AppError(TASK_NOT_FOUND_MESSAGE, NOT_FOUND);
  return task;
};

const updateTaskStatus = (id, status) => updateTask(id, { status });

const deleteTask = async (id) => {
  const task = await Task.findByIdAndDelete(id);
  if (!task) throw new AppError(TASK_NOT_FOUND_MESSAGE, NOT_FOUND);
  return task;
};

const zeroFilledCounts = (keys, rows) => {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  rows.forEach(({ _id, count }) => {
    if (_id in counts) counts[_id] = count;
  });
  return counts;
};

const getTaskStats = async (dateRange = {}) => {
  const now = new Date();
  const dueSoonLimit = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
  const activeWithDueDate = { status: { $in: ACTIVE_TASK_STATUSES }, dueDate: { $ne: null } };
  const dateFilter = buildFilter(dateRange);

  const [result] = await Task.aggregate([
    { $match: dateFilter },
    {
      $facet: {
        total: [{ $count: 'count' }],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        overdue: [
          { $match: { ...activeWithDueDate, dueDate: { $lt: now } } },
          { $count: 'count' },
        ],
        dueSoon: [
          { $match: { ...activeWithDueDate, dueDate: { $gte: now, $lte: dueSoonLimit } } },
          { $count: 'count' },
        ],
      },
    },
  ]);

  const total = result.total[0]?.count ?? 0;
  const byStatus = zeroFilledCounts(TASK_STATUSES, result.byStatus);
  const byPriority = zeroFilledCounts(TASK_PRIORITIES, result.byPriority);

  // Cancelled tasks are excluded: they are neither done nor pending.
  const trackable = total - byStatus[TASK_STATUS.CANCELLED];
  const completionRate =
    trackable > 0 ? Math.round((byStatus[TASK_STATUS.COMPLETED] / trackable) * 100) : 0;

  return {
    total,
    byStatus,
    byPriority,
    overdue: result.overdue[0]?.count ?? 0,
    dueSoon: result.dueSoon[0]?.count ?? 0,
    completionRate,
  };
};

module.exports = {
  getTasks,
  getTaskById,
  createTask,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTaskStats,
};
