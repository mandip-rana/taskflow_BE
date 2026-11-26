const TASK_STATUS = Object.freeze({
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const TASK_STATUSES = Object.freeze(Object.values(TASK_STATUS));
const TASK_PRIORITIES = Object.freeze(Object.values(TASK_PRIORITY));

// Statuses that still need work (used for overdue / due-soon calculations).
const ACTIVE_TASK_STATUSES = Object.freeze([TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS]);

const TASK_SORT_FIELDS = Object.freeze(['createdAt', 'dueDate']);

const TASK_LIMITS = Object.freeze({
  TITLE_MAX: 200,
  DESCRIPTION_MAX: 2000,
  SEARCH_MAX: 100,
  CHECKLIST_ITEM_TITLE_MAX: 200,
  CHECKLIST_ITEMS_MAX: 100,
});

const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
});

const DUE_SOON_DAYS = 7;

module.exports = {
  TASK_STATUS,
  TASK_PRIORITY,
  TASK_STATUSES,
  TASK_PRIORITIES,
  ACTIVE_TASK_STATUSES,
  TASK_SORT_FIELDS,
  TASK_LIMITS,
  PAGINATION,
  DUE_SOON_DAYS,
};
