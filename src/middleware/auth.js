const User = require('../models/User');
const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/token');

/**
 * Verifies the Bearer JWT and loads the user (findById -> default _id index).
 * Loading from the DB (instead of trusting the token's role claim) means deleted
 * users and role changes take effect immediately.
 */
async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Authentication required');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'User no longer exists');

  req.user = user;
  next();
}

/** Role guard, e.g. authorize('admin'). Must run after authenticate. */
const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError(403, 'Forbidden');
  next();
};

module.exports = { authenticate, authorize };
