/**
 * Zod Validation Middleware
 * Route handler'lardan once req.body, req.query veya req.params dogrular.
 */
const { ZodError } = require('zod');

/**
 * validate(schema, source)
 * @param {import('zod').ZodSchema} schema - Zod schema
 * @param {'body'|'query'|'params'} source - Hangi req parcasini dogrulayacak (default: 'body')
 * @returns Express middleware
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code
      }));
      return res.status(400).json({
        error: 'Dogrulama hatasi',
        details: errors
      });
    }
    // Validated + transformed data'yi req[source]'a geri yaz
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
