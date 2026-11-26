const { connectDB, disconnectDB } = require('../src/config/db');
const Task = require('../src/modules/tasks/task.model');
const TaskCounter = require('../src/modules/tasks/task-counter.model');

const TASK_COUNTER_ID = 'task';

const migrate = async () => {
  await connectDB();
  await Task.init();

  const [counter, highestNumberedTask, unnumberedTasks] = await Promise.all([
    TaskCounter.findById(TASK_COUNTER_ID).lean(),
    Task.findOne({ taskNumber: { $type: 'number' } })
      .sort({ taskNumber: -1 })
      .select('taskNumber')
      .lean(),
    Task.find({ taskNumber: { $exists: false } })
      .sort({ createdAt: 1, _id: 1 })
      .select('_id')
      .lean(),
  ]);

  let sequence = Math.max(counter?.sequence ?? 0, highestNumberedTask?.taskNumber ?? 0);
  const operations = unnumberedTasks.map(({ _id }) => ({
    updateOne: {
      filter: { _id, taskNumber: { $exists: false } },
      update: { $set: { taskNumber: ++sequence } },
    },
  }));

  if (operations.length > 0) {
    await Task.collection.bulkWrite(operations, { ordered: true });
  }

  await TaskCounter.findOneAndUpdate(
    { _id: TASK_COUNTER_ID },
    { $max: { sequence } },
    { new: true, upsert: true },
  );

  console.log(`Assigned IDs to ${operations.length} existing tasks. Next ID: ${sequence + 1}.`);
};

migrate()
  .catch((error) => {
    console.error('Task ID migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
