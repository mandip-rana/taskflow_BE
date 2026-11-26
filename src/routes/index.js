const express = require('express');
const healthRoutes = require('./health.routes');
const taskRoutes = require('../modules/tasks/task.routes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/tasks', taskRoutes);

module.exports = router;
