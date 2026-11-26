const express = require('express');
const { isDBConnected } = require('../config/db');
const { OK, SERVICE_UNAVAILABLE } = require('../shared/constants/http');

const router = express.Router();

router.get('/', (req, res) => {
  const database = isDBConnected() ? 'connected' : 'disconnected';
  const healthy = database === 'connected';

  res.status(healthy ? OK : SERVICE_UNAVAILABLE).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
