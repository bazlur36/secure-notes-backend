const User = require('../models/User');
const Post = require('../models/Post');

/*
 * Pipeline builders are kept separate from controllers so that the exact same
 * pipelines can be run through explain() in src/scripts/explain.js.
 */

/**
 * SCENARIO 1 — Users grouped by interest.
 * Constraint: exactly ONE collection.aggregate() call. Pagination metadata (total
 * number of groups) is produced inside the same call with $facet, so no extra
 * countDocuments()/find() is needed.
 *
 * Index: users { interests: 1 } (multikey)
 *  - With ?interest=x : $match { interests: 'x' }           -> IXSCAN, point bounds ["x","x"]
 *  - Without filter   : $match { interests: { $type: 'string' } } -> IXSCAN over the string
 *    range of the index; users with no interests are never fetched. Grouping ALL
 *    users is inherently a scan of every user that has interests, the index just
 *    limits it to those documents.
 */
function groupByInterestsPipeline({ interest, skip, limit, usersPerGroup }) {
  return [
    { $match: interest ? { interests: interest } : { interests: { $type: 'string' } } },
    // Keep only what we need as early as possible (less memory for $unwind/$group)
    { $project: { _id: 1, name: 1, interests: 1 } },
    { $unwind: '$interests' },
    // After unwinding, a filtered request must drop the user's *other* interests
    ...(interest ? [{ $match: { interests: interest } }] : []),
    {
      $group: {
        _id: '$interests',
        userCount: { $sum: 1 },
        // Bounded + deterministic list of members per group (MongoDB 5.2+)
        users: {
          $topN: { n: usersPerGroup, sortBy: { name: 1, _id: 1 }, output: { _id: '$_id', name: '$name' } },
        },
      },
    },
    { $sort: { userCount: -1, _id: 1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 0, interest: '$_id', userCount: 1, users: 1 } },
        ],
        meta: [{ $count: 'total' }],
      },
    },
  ];
}

async function groupUsersByInterests(opts) {
  const [result] = await User.aggregate(groupByInterestsPipeline(opts)); // the single aggregate() call
  return { groups: result.data, total: result.meta[0]?.total ?? 0 };
}

/**
 * SCENARIO 2 — All posts of a particular user, single pipeline with $lookup.
 *
 * Indexes:
 *  - users { _id: 1 } (default)       -> $match { _id }
 *  - posts { author: 1, _id: -1 }     -> $lookup equality on `author` + inner $sort { _id: -1 }
 *    (the equality match and the sort are both answered by the compound index,
 *     so there is no collection scan and no in-memory sort on posts)
 */
function userPostsPipeline({ userId, skip, limit }) {
  return [
    { $match: { _id: userId } },
    { $project: { name: 1, interests: 1 } },
    {
      $lookup: {
        from: Post.collection.collectionName,
        localField: '_id',
        foreignField: 'author',
        as: 'posts',
        pipeline: [
          { $sort: { _id: -1 } },
          {
            $facet: {
              data: [{ $skip: skip }, { $limit: limit }, { $project: { author: 0 } }],
              meta: [{ $count: 'total' }],
            },
          },
        ],
      },
    },
    { $set: { posts: { $first: '$posts' } } },
    {
      $project: {
        _id: 0,
        user: { _id: '$_id', name: '$name', interests: '$interests' },
        posts: '$posts.data',
        total: { $ifNull: [{ $first: '$posts.meta.total' }, 0] },
      },
    },
  ];
}

async function getUserPosts(opts) {
  const [result] = await User.aggregate(userPostsPipeline(opts));
  return result || null; // null => user not found
}

module.exports = {
  groupByInterestsPipeline,
  groupUsersByInterests,
  userPostsPipeline,
  getUserPosts,
};
