const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const rateLimiter = require('./middleware/rateLimiter');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const API_PREFIX = '/api/v1';

const app = express();

app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', env.trustProxy);

app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
if (env.nodeEnv !== 'test') app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use(rateLimiter);
app.use(express.json({ limit: '100kb' }));

app.use(API_PREFIX, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
