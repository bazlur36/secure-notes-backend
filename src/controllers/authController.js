const User = require('../models/User');
const AppError = require('../utils/AppError');
const { hashPassword, verifyPassword, getDummyHash } = require('../utils/password');
const { signToken } = require('../utils/token');

async function register(req, res) {
  const { name, email, password, interests } = req.body;
  // Role is never taken from the request: public sign-up always creates a "user".
  const user = await User.create({
    name,
    email,
    interests,
    password: await hashPassword(password),
    role: 'user',
  }); // duplicate email -> unique index -> 409 via error handler
  res.status(201).json({ token: signToken(user), user });
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password'); // { email: 1 } unique index
  const ok = await verifyPassword(password, user ? user.password : await getDummyHash());
  if (!user || !ok) throw new AppError(401, 'Invalid email or password');
  res.json({ token: signToken(user), user });
}

async function me(req, res) {
  res.json({ user: req.user });
}

async function updateMe(req, res) {
  const { name, interests, password } = req.body;
  if (name !== undefined) req.user.name = name;
  if (interests !== undefined) req.user.interests = interests;
  if (password !== undefined) req.user.password = await hashPassword(password);
  await req.user.save();
  res.json({ user: req.user });
}

module.exports = { register, login, me, updateMe };
