/*
 * Runs every list/read query and both aggregation pipelines through
 * explain('executionStats') and prints which index (if any) each one used.
 * Usage: npm run seed && npm run explain
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Note = require('../models/Note');
const Post = require('../models/Post');
const { groupByInterestsPipeline, userPostsPipeline } = require('../services/aggregations');

// Recursively collect stage names / index names / lookup stats from any explain shape
function summarize(explain) {
  const stages = new Set();
  const indexes = new Set();
  let keys = 0;
  let docs = 0;
  const lookups = [];

  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.stage === 'string') stages.add(node.stage);
    if (typeof node.indexName === 'string') indexes.add(node.indexName);
    if (node.executionStats && typeof node.executionStats.totalKeysExamined === 'number') {
      keys += node.executionStats.totalKeysExamined;
      docs += node.executionStats.totalDocsExamined;
    }
    if (node.$lookup && node.totalDocsExamined !== undefined) {
      lookups.push({
        keysExamined: node.totalKeysExamined,
        docsExamined: node.totalDocsExamined,
        collectionScans: node.collectionScans,
        indexesUsed: node.indexesUsed,
      });
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'rejectedPlans') continue;
      walk(v);
    }
  })(explain);

  if (stages.has('IDHACK')) indexes.add('_id_ (IDHACK fast path)');
  return { stages: [...stages], indexes: [...indexes], keys, docs, lookups };
}

function report(label, s) {
  const usedCollScan = s.stages.includes('COLLSCAN');
  console.log(`\n${usedCollScan ? '✗' : '✓'} ${label}`);
  console.log(`   stages : ${s.stages.join(' > ') || '(n/a)'}`);
  console.log(`   index  : ${s.indexes.join(', ') || '(none)'}`);
  console.log(`   keysExamined=${s.keys} docsExamined=${s.docs}`);
  for (const l of s.lookups) {
    console.log(`   $lookup: indexesUsed=${JSON.stringify(l.indexesUsed)} collectionScans=${l.collectionScans} ` +
      `keysExamined=${l.keysExamined} docsExamined=${l.docsExamined}`);
  }
}

(async () => {
  await connectDB();
  const user = await User.findOne({ email: 'user@example.com' }).lean();
  if (!user) throw new Error('Run `npm run seed` first');
  const note = await Note.findOne({ owner: user._id }).lean();
  const poster = await Post.findOne().lean();
  const page = { skip: 0, limit: 10 };

  const q = async (label, query) => report(label, summarize(await query.explain('executionStats')));
  const a = async (label, Model, pipeline) =>
    report(label, summarize(await Model.aggregate(pipeline).explain('executionStats')));

  console.log('Declared indexes:');
  for (const M of [User, Note, Post]) {
    const idx = await M.collection.indexes();
    console.log(`  ${M.collection.collectionName}: ${idx.map((i) => JSON.stringify(i.key)).join('  ')}`);
  }

  await q('Login: users.findOne({ email })', User.findOne({ email: 'user@example.com' }));
  await q('Profile: users.findById(id)', User.findById(user._id));
  await q('Admin list users: users.find().sort({_id:-1})', User.find().sort({ _id: -1 }).limit(10));
  await q('My notes: notes.find({owner}).sort({_id:-1})', Note.find({ owner: user._id }).sort({ _id: -1 }).limit(10));
  // countDocuments() is executed by the driver as this exact aggregation
  await a('My notes count: notes.countDocuments({owner})', Note,
    [{ $match: { owner: user._id } }, { $group: { _id: 1, n: { $sum: 1 } } }]);
  await q('Get note: notes.findOne({_id, owner})', Note.findOne({ _id: note._id, owner: user._id }));
  await q('Admin all notes: notes.find().sort({_id:-1})', Note.find().sort({ _id: -1 }).limit(10));
  await q('Public posts: posts.find().sort({_id:-1})', Post.find().sort({ _id: -1 }).limit(10));

  await a('Scenario 1 (filtered ?interest=chess)', User,
    groupByInterestsPipeline({ interest: 'chess', usersPerGroup: 20, ...page }));
  await a('Scenario 1 (all interests)', User,
    groupByInterestsPipeline({ interest: undefined, usersPerGroup: 20, ...page }));
  await a('Scenario 2 ($lookup user posts)', User, userPostsPipeline({ userId: poster.author, ...page }));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
