const User = require('../models/User');
const Note = require('../models/Note');
const Post = require('../models/Post');
const AppError = require('../utils/AppError');
const { hashPassword } = require('../utils/password');
const { getPagination, buildMeta } = require('../utils/pagination');
const { toObjectId } = require('../utils/objectId');

/** GET /api/admin/users — default _id index (sort by _id, newest first). */
async function listUsers(req, res) {
  const p = getPagination(req.query);
  const [data, total] = await Promise.all([
    User.find().sort({ _id: -1 }).skip(p.skip).limit(p.limit).lean(),
    User.estimatedDocumentCount(), // collection metadata, no scan
  ]);
  res.json({ data: data.map(stripPrivate), meta: buildMeta(p, total) });
}

/** GET /api/admin/users/:id — default _id index. */
async function getUser(req, res) {
  const user = await User.findById(toObjectId(req.params.id, 'user id'));
  if (!user) throw new AppError(404, 'User not found');
  res.json({ data: user });
}

async function createUser(req, res) {
  const { password, ...rest } = req.body;
  const user = await User.create({ ...rest, password: await hashPassword(password) });
  res.status(201).json({ data: user });
}

async function updateUser(req, res) {
  const _id = toObjectId(req.params.id, 'user id');
  const update = { ...req.body };

  if (_id.equals(req.user._id) && update.role && update.role !== 'admin') {
    throw new AppError(400, 'You cannot remove your own admin role');
  }
  if (update.password) update.password = await hashPassword(update.password);

  const user = await User.findByIdAndUpdate(_id, { $set: update }, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ data: user });
}

/** DELETE /api/admin/users/:id — also removes the user's notes and posts. */
async function deleteUser(req, res) {
  const _id = toObjectId(req.params.id, 'user id');
  if (_id.equals(req.user._id)) throw new AppError(400, 'You cannot delete your own account');

  const result = await User.deleteOne({ _id });
  if (result.deletedCount === 0) throw new AppError(404, 'User not found');

  // Cascades use the leading field of { owner: 1, _id: -1 } / { author: 1, _id: -1 }
  await Promise.all([Note.deleteMany({ owner: _id }), Post.deleteMany({ author: _id })]);
  res.status(204).end();
}

/**
 * GET /api/admin/notes — everyone's notes.
 *  - no filter      : default _id index, estimatedDocumentCount()
 *  - ?owner=<id>    : { owner: 1, _id: -1 } index, countDocuments() -> COUNT_SCAN
 */
async function listAllNotes(req, res) {
  const p = getPagination(req.query);
  const filter = req.query.owner ? { owner: toObjectId(req.query.owner, 'owner id') } : {};
  const [data, total] = await Promise.all([
    Note.find(filter)
      .sort({ _id: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .populate('owner', 'name email') // batched lookup by _id
      .lean(),
    req.query.owner ? Note.countDocuments(filter) : Note.estimatedDocumentCount(),
  ]);
  res.json({ data, meta: buildMeta(p, total) });
}

function stripPrivate(u) {
  const { password, __v, ...rest } = u;
  return rest;
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser, listAllNotes };
