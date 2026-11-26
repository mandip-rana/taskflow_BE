const mongoose = require('mongoose');
const {
  TASK_STATUS,
  TASK_PRIORITY,
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_LIMITS,
} = require('../../shared/constants/task');

const checklistItemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Checklist item title is required'],
      trim: true,
      minlength: [1, 'Checklist item title is required'],
      maxlength: [
        TASK_LIMITS.CHECKLIST_ITEM_TITLE_MAX,
        `Checklist item title must be at most ${TASK_LIMITS.CHECKLIST_ITEM_TITLE_MAX} characters`,
      ],
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, versionKey: false },
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [1, 'Title is required'],
      maxlength: [TASK_LIMITS.TITLE_MAX, `Title must be at most ${TASK_LIMITS.TITLE_MAX} characters`],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [
        TASK_LIMITS.DESCRIPTION_MAX,
        `Description must be at most ${TASK_LIMITS.DESCRIPTION_MAX} characters`,
      ],
    },
    status: {
      type: String,
      enum: { values: TASK_STATUSES, message: 'Invalid status: {VALUE}' },
      default: TASK_STATUS.TODO,
    },
    priority: {
      type: String,
      enum: { values: TASK_PRIORITIES, message: 'Invalid priority: {VALUE}' },
      default: TASK_PRIORITY.MEDIUM,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    taskNumber: {
      type: Number,
      immutable: true,
      min: 1,
    },
    checklistItems: {
      type: [checklistItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        if (Number.isSafeInteger(ret.taskNumber)) {
          ret.taskCode = `TK-${String(ret.taskNumber).padStart(6, '0')}`;
        }
        const checklistItems = Array.isArray(ret.checklistItems) ? ret.checklistItems : [];
        ret.checklistItems = checklistItems.map((item) => {
          const { _id, ...fields } = item;
          return { ...fields, id: _id.toString() };
        });
        const completed = ret.checklistItems.filter((item) => item.isCompleted).length;
        ret.checklistSummary = {
          total: ret.checklistItems.length,
          completed,
          pending: ret.checklistItems.length - completed,
        };
        return ret;
      },
    },
  },
);

// Indexes for the list endpoint (filter by status/priority, sort by dates)
// and for the stats endpoint.
taskSchema.index({ createdAt: -1 });
taskSchema.index({ status: 1, createdAt: -1 });
taskSchema.index({ priority: 1, createdAt: -1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ taskNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Task', taskSchema);
