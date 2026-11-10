const { Types } = require('mongoose');
const AppError = require('./AppError');

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/** Validate a 24-hex ObjectId string and convert it; throws 400 otherwise. */
function toObjectId(value, label = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID_RE.test(value)) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return new Types.ObjectId(value);
}

module.exports = { toObjectId };
