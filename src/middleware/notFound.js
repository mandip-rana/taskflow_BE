const AppError = require('../shared/utils/AppError');
const { NOT_FOUND } = require('../shared/constants/http');

const notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, NOT_FOUND));
};

module.exports = notFound;
