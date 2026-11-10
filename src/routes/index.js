const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const auth = require('../controllers/authController');
const notes = require('../controllers/noteController');
const admin = require('../controllers/adminController');
const users = require('../controllers/userController');
const posts = require('../controllers/postController');

const router = Router();

// Brute-force protection for credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, please try again later' } },
});

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---- Auth ----
router.post('/auth/register', authLimiter, validate(v.registerSchema), auth.register);
router.post('/auth/login', authLimiter, validate(v.loginSchema), auth.login);
router.get('/auth/me', authenticate, auth.me);
router.patch('/auth/me', authenticate, validate(v.updateMeSchema), auth.updateMe);

// ---- Notes (owner scoped) ----
router.get('/notes', authenticate, notes.listMyNotes);
router.post('/notes', authenticate, validate(v.createNoteSchema), notes.createNote);
router.get('/notes/:id', authenticate, notes.getNote);
router.patch('/notes/:id', authenticate, validate(v.updateNoteSchema), notes.updateNote);
router.delete('/notes/:id', authenticate, notes.deleteNote);

// ---- Admin ----
const adminOnly = [authenticate, authorize('admin')];
router.get('/admin/users', adminOnly, admin.listUsers);
router.post('/admin/users', adminOnly, validate(v.adminCreateUserSchema), admin.createUser);
router.get('/admin/users/:id', adminOnly, admin.getUser);
router.patch('/admin/users/:id', adminOnly, validate(v.adminUpdateUserSchema), admin.updateUser);
router.delete('/admin/users/:id', adminOnly, admin.deleteUser);
router.get('/admin/notes', adminOnly, admin.listAllNotes);

// ---- Users / aggregations ----
// (static path registered before /users/:id)
router.get('/users/grouped-by-interest', authenticate, users.groupedByInterest); // Scenario 1
router.get('/users/:id', users.getProfile);
router.get('/users/:id/posts', users.userPosts); // Scenario 2 — posts are public

// ---- Posts (public read) ----
router.get('/posts', posts.listPosts);
router.get('/posts/:id', posts.getPost);
router.post('/posts', authenticate, validate(v.createPostSchema), posts.createPost);
router.delete('/posts/:id', authenticate, posts.deletePost);

module.exports = router;
