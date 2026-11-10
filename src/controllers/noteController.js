const Note = require('../models/Note');
const AppError = require('../utils/AppError');
const { getPagination, buildMeta } = require('../utils/pagination');
const { toObjectId } = require('../utils/objectId');

/** GET /api/notes — the current user's notes. Index: { owner: 1, _id: -1 } */
async function listMyNotes(req, res) {
  const p = getPagination(req.query);
  const filter = { owner: req.user._id };
  const [data, total] = await Promise.all([
    Note.find(filter).sort({ _id: -1 }).skip(p.skip).limit(p.limit).lean(),
    Note.countDocuments(filter), // COUNT_SCAN on the same index
  ]);
  res.json({ data, meta: buildMeta(p, total) });
}

async function createNote(req, res) {
  const note = await Note.create({ ...req.body, owner: req.user._id });
  res.status(201).json({ data: note });
}

/**
 * GET /api/notes/:id — owner, or an admin (admins can view everyone's notes).
 * Uses the default _id index in both cases.
 */
async function getNote(req, res) {
  const _id = toObjectId(req.params.id, 'note id');
  const filter = req.user.role === 'admin' ? { _id } : { _id, owner: req.user._id };
  const note = await Note.findOne(filter).lean();
  // 404 (not 403) for other users' notes so ids of foreign notes are not confirmed
  if (!note) throw new AppError(404, 'Note not found');
  res.json({ data: note });
}

/** PATCH /api/notes/:id — owner only (ownership enforced inside the query itself). */
async function updateNote(req, res) {
  const _id = toObjectId(req.params.id, 'note id');
  const note = await Note.findOneAndUpdate({ _id, owner: req.user._id }, { $set: req.body }, {
    returnDocument: 'after',
    runValidators: true,
  }).lean();
  if (!note) throw new AppError(404, 'Note not found');
  res.json({ data: note });
}

/** DELETE /api/notes/:id — owner only. */
async function deleteNote(req, res) {
  const _id = toObjectId(req.params.id, 'note id');
  const result = await Note.deleteOne({ _id, owner: req.user._id });
  if (result.deletedCount === 0) throw new AppError(404, 'Note not found');
  res.status(204).end();
}

module.exports = { listMyNotes, createNote, getNote, updateNote, deleteNote };
