const User = require('../models/User');
const AppError = require('../utils/AppError');
const { getPagination, buildMeta } = require('../utils/pagination');
const { toObjectId } = require('../utils/objectId');
const { groupUsersByInterests, getUserPosts } = require('../services/aggregations');

/** GET /api/users/:id — public profile. Default _id index. */
async function getProfile(req, res) {
  const user = await User.findById(toObjectId(req.params.id, 'user id'))
    .select('name interests createdAt')
    .lean();
  if (!user) throw new AppError(404, 'User not found');
  res.json({ data: user });
}

/** GET /api/users/grouped-by-interest?interest=&page=&limit=&usersPerGroup= — Scenario 1 */
async function groupedByInterest(req, res) {
  const p = getPagination(req.query);
  const usersPerGroup = Math.min(Math.max(Number.parseInt(req.query.usersPerGroup, 10) || 20, 1), 100);
  const interest =
    typeof req.query.interest === 'string' && req.query.interest.trim()
      ? req.query.interest.trim().toLowerCase()
      : undefined;

  const { groups, total } = await groupUsersByInterests({ interest, usersPerGroup, ...p });
  res.json({ data: groups, meta: buildMeta(p, total) });
}

/** GET /api/users/:id/posts?page=&limit= — Scenario 2 ($lookup) */
async function userPosts(req, res) {
  const p = getPagination(req.query);
  const result = await getUserPosts({ userId: toObjectId(req.params.id, 'user id'), ...p });
  if (!result) throw new AppError(404, 'User not found');
  res.json({ user: result.user, data: result.posts, meta: buildMeta(p, result.total) });
}

module.exports = { getProfile, groupedByInterest, userPosts };
