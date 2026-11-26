const { z } = require('zod');
const {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_LIMITS,
  PAGINATION,
} = require('../../shared/constants/task');

const enumOf = (name, values) =>
  z.enum(values, { error: () => `${name} must be one of: ${values.join(', ')}` });

const statusSchema = enumOf('status', TASK_STATUSES);
const prioritySchema = enumOf('priority', TASK_PRIORITIES);

// Accepts "2026-12-31" or a full ISO 8601 timestamp and converts it to a Date.
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const dueDateSchema = z
  .string({ error: 'dueDate must be an ISO 8601 date string' })
  .regex(ISO_DATE_PATTERN, 'dueDate must be an ISO 8601 date (e.g. 2026-12-31)')
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), 'dueDate is not a valid date');

const titleSchema = z
  .string({ error: 'title must be a string' })
  .trim()
  .min(1, 'title is required')
  .max(TASK_LIMITS.TITLE_MAX, `title must be at most ${TASK_LIMITS.TITLE_MAX} characters`);

const descriptionSchema = z
  .string({ error: 'description must be a string' })
  .trim()
  .max(TASK_LIMITS.DESCRIPTION_MAX, `description must be at most ${TASK_LIMITS.DESCRIPTION_MAX} characters`);

const checklistItemTitleSchema = z
  .string({ error: 'title must be a string' })
  .trim()
  .min(1, 'title is required')
  .max(
    TASK_LIMITS.CHECKLIST_ITEM_TITLE_MAX,
    `title must be at most ${TASK_LIMITS.CHECKLIST_ITEM_TITLE_MAX} characters`,
  );

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid MongoDB ObjectId');

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'must be a valid calendar date');

const dateRangeFields = {
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
};

const validateDateRange = ({ dateFrom, dateTo }, context) => {
  if (dateFrom && dateTo && dateFrom > dateTo) {
    context.addIssue({
      code: 'custom',
      path: ['dateTo'],
      message: 'dateTo must be on or after dateFrom',
    });
  }
};

const idParamSchema = z.object({ id: objectIdSchema });
const checklistItemParamSchema = z.object({ id: objectIdSchema, itemId: objectIdSchema });

const createTaskSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    dueDate: dueDateSchema.nullable().optional(),
    checklistItems: z.array(
      z.object({
        title: checklistItemTitleSchema,
        isCompleted: z.boolean().optional(),
      }).strict(),
    ).max(
      TASK_LIMITS.CHECKLIST_ITEMS_MAX,
      `checklistItems must contain at most ${TASK_LIMITS.CHECKLIST_ITEMS_MAX} items`,
    ).optional(),
  })
  .strict();

const updateTaskSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    dueDate: dueDateSchema.nullable().optional(), // null clears the due date
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

const updateStatusSchema = z.object({ status: statusSchema }).strict();
const createChecklistItemSchema = z.object({ title: checklistItemTitleSchema }).strict();
const updateChecklistItemSchema = z
  .object({
    title: checklistItemTitleSchema.optional(),
    isCompleted: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

const listTasksQuerySchema = z.object({
  page: z.coerce
    .number({ error: 'page must be a number' })
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number({ error: 'limit must be a number' })
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(PAGINATION.MAX_LIMIT, `limit must be at most ${PAGINATION.MAX_LIMIT}`)
    .default(PAGINATION.DEFAULT_LIMIT),
  search: z
    .string()
    .trim()
    .max(TASK_LIMITS.SEARCH_MAX, `search must be at most ${TASK_LIMITS.SEARCH_MAX} characters`)
    .transform((value) => value || undefined)
    .optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  sortBy: enumOf('sortBy', TASK_SORT_FIELDS).default('createdAt'),
  order: enumOf('order', ['asc', 'desc']).default('desc'),
  ...dateRangeFields,
}).superRefine(validateDateRange);

const taskStatsQuerySchema = z.object(dateRangeFields).superRefine(validateDateRange);

module.exports = {
  idParamSchema,
  checklistItemParamSchema,
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
  listTasksQuerySchema,
  taskStatsQuerySchema,
};
