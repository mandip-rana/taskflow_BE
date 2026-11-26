const AppError = require('../shared/utils/AppError');
const { BAD_REQUEST } = require('../shared/constants/http');

/**
 * Validates req.params / req.query / req.body against zod schemas.
 * Parsed (coerced, trimmed, defaulted) values are exposed on `req.validated`
 * because `req.query` is read-only in Express 5.
 */
const validate = (schemas) => (req, res, next) => {
  const errors = [];
  const validated = {};

  for (const source of ['params', 'query', 'body']) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source] ?? {});
    if (result.success) {
      validated[source] = result.data;
    } else {
      for (const issue of result.error.issues) {
        const unknownKeys = issue.code === 'unrecognized_keys' ? issue.keys : null;
        if (unknownKeys) {
          unknownKeys.forEach((key) =>
            errors.push({ field: key, message: `Unknown field "${key}"`, location: source }),
          );
        } else {
          errors.push({
            field: issue.path.join('.') || undefined,
            message: issue.message,
            location: source,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return next(new AppError('Validation failed', BAD_REQUEST, errors));
  }

  req.validated = validated;
  return next();
};

module.exports = validate;
