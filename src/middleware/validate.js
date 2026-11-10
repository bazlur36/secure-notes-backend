/**
 * Validate req.body against a zod schema and replace it with the parsed value.
 * Strict typing also blocks NoSQL operator injection (e.g. { "email": { "$gt": "" } }).
 */
const validate = (schema) => (req, _res, next) => {
  req.body = schema.parse(req.body ?? {});
  next();
};

module.exports = validate;
