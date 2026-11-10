/* Seeds demo data. WARNING: wipes the users, notes and posts collections. */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { nodeEnv } = require('../config/env');
const User = require('../models/User');
const Note = require('../models/Note');
const Post = require('../models/Post');
const { hashPassword } = require('../utils/password');

const INTERESTS = ['chess', 'reading', 'music', 'travel', 'coding', 'cooking', 'football', 'photography', 'gaming', 'hiking'];
const FIRST = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory', 'Niaj', 'Olivia', 'Peggy', 'Rupert', 'Sybil', 'Trent', 'Victor', 'Walter', 'Yasmin'];

const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function seed() {
  if (nodeEnv === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to wipe a production database. Re-run with --force if you are sure.');
  }

  await connectDB();
  await Promise.all([User.deleteMany({}), Note.deleteMany({}), Post.deleteMany({})]);
  // Make the DB indexes match exactly what the schemas declare (drops stray indexes)
  await Promise.all([User.syncIndexes(), Note.syncIndexes(), Post.syncIndexes()]);

  const adminPwd = await hashPassword('Admin@12345');
  const userPwd = await hashPassword('User@12345');

  const fixed = [
    { name: 'Admin', email: 'admin@example.com', password: adminPwd, role: 'admin', interests: ['chess', 'coding'] },
    { name: 'Demo User', email: 'user@example.com', password: userPwd, role: 'user', interests: ['chess', 'reading'] },
  ];
  const generated = Array.from({ length: 60 }, (_, i) => ({
    name: `${FIRST[i % FIRST.length]} ${i + 1}`,
    email: `user${i + 1}@example.com`,
    password: userPwd,
    role: 'user',
    interests: i % 10 === 0 ? [] : pick(INTERESTS, rand(1, 4)), // some users without interests
  }));
  const users = await User.insertMany([...fixed, ...generated]);

  const notes = [];
  const posts = [];
  for (const u of users) {
    for (let n = 1; n <= rand(3, 15); n++) {
      notes.push({ owner: u._id, title: `${u.name}'s note #${n}`, content: `Private content ${n} of ${u.name}.` });
    }
    for (let n = 1; n <= rand(0, 6); n++) {
      posts.push({ author: u._id, title: `${u.name} — post #${n}`, body: `Public post ${n} written by ${u.name}.` });
    }
  }
  await Note.insertMany(notes);
  await Post.insertMany(posts);

  console.log(`Seeded ${users.length} users, ${notes.length} notes, ${posts.length} posts`);
  console.log('Admin login : admin@example.com / Admin@12345');
  console.log('User login  : user@example.com  / User@12345');
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
