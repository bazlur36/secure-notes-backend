const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/env');

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn,
    algorithm: 'HS256',
  });

const verifyToken = (token) => jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });

module.exports = { signToken, verifyToken };
