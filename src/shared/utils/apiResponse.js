const { OK } = require('../constants/http');

/**
 * Consistent success envelope:
 * { success: true, message?, data?, meta? }
 */
const sendSuccess = (res, { statusCode = OK, message, data, meta } = {}) =>
  res.status(statusCode).json({
    success: true,
    ...(message !== undefined && { message }),
    ...(data !== undefined && { data }),
    ...(meta !== undefined && { meta }),
  });

module.exports = { sendSuccess };
