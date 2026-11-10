const Post = require('../models/Post');
const AppError = require('../utils/AppError');
const { getPagination, buildMeta } = require('../utils/pagination');
const { toObjectId } = require('../utils/objectId');

/** GET /api/posts — public feed. Default _id index + estimatedDocumentCount(). */
async function listPosts(req, res) {
  const p = getPagination(req.query);
  const [data, total] = await Promise.all([
    Post.find().sort({ _id: -1 }).skip(p.skip).limit(p.limit).populate('author', 'name').lean(),
    Post.estimatedDocumentCount(),
  ]);
  res.json({ data, meta: buildMeta(p, total) });
}

/** GET /api/posts/:id — default _id index. */
async function getPost(req, res) {
  const post = await Post.findById(toObjectId(req.params.id, 'post id')).populate('author', 'name').lean();
  if (!post) throw new AppError(404, 'Post not found');
  res.json({ data: post });
}

async function createPost(req, res) {
  const post = await Post.create({ ...req.body, author: req.user._id });
  res.status(201).json({ data: post });
}

/** DELETE /api/posts/:id — author, or admin. */
async function deletePost(req, res) {
  const _id = toObjectId(req.params.id, 'post id');
  const filter = req.user.role === 'admin' ? { _id } : { _id, author: req.user._id };
  const result = await Post.deleteOne(filter);
  if (result.deletedCount === 0) throw new AppError(404, 'Post not found');
  res.status(204).end();
}

module.exports = { listPosts, getPost, createPost, deletePost };
