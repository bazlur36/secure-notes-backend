/* Builds declared indexes and DROPS any index not declared via schema.index(). */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Note = require('../models/Note');
const Post = require('../models/Post');

(async () => {
  await connectDB();
  for (const M of [User, Note, Post]) {
    const dropped = await M.syncIndexes();
    const indexes = await M.collection.indexes();
    console.log(`${M.collection.collectionName}:`, indexes.map((i) => JSON.stringify(i.key)).join('  '),
      dropped.length ? `(dropped: ${dropped.join(', ')})` : '');
  }
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
