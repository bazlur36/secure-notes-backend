const { Schema, model } = require('mongoose');

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 20000 },
  },
  { timestamps: true, versionKey: false }
);

/*
 * INDEXES
 *
 * 1. { author: 1, _id: -1 }  (Equality -> Sort)
 *    - Scenario 2 aggregation     -> $lookup on foreignField `author`, inner $sort { _id: -1 }
 *    - DELETE /admin/users/:id    -> deleteMany({ author }) cascade
 *
 * Covered by the default { _id: 1 } index:
 *    - GET /posts                 -> find().sort({ _id: -1 }) (public feed)
 *    - GET /posts/:id
 */
postSchema.index({ author: 1, _id: -1 });

module.exports = model('Post', postSchema);
