const bcrypt = require('bcryptjs');
const { bcryptRounds } = require('../config/env');

const hashPassword = (plain) => bcrypt.hash(plain, bcryptRounds); // unique salt generated per hash
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// A real hash with the same cost factor, used when a login email does not exist so
// the response time is the same as for a wrong password (prevents user enumeration).
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword('dummy-password-for-timing'));

module.exports = { hashPassword, verifyPassword, getDummyHash };
