const { Schema, model } = require('mongoose');

const noteSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: '', maxlength: 20000 },
  },
  { timestamps: true, versionKey: false }
);

/*
 * INDEXES
 *
 * 1. { owner: 1, _id: -1 }  (Equality -> Sort)
 *    - GET /notes                 -> find({ owner }).sort({ _id: -1 }).skip().limit()
 *                                    (filter AND sort served by the index, no in-memory SORT)
 *    - countDocuments({ owner })  -> COUNT_SCAN for pagination totals
 *    - GET /admin/notes?owner=    -> same shape
 *    - DELETE /admin/users/:id    -> deleteMany({ owner }) cascade
 *    A plain { owner: 1 } index would NOT be enough: it would force an in-memory sort.
 *
 * Covered by the default { _id: 1 } index:
 *    - GET/PATCH/DELETE /notes/:id -> findOne({ _id, owner })
 *    - GET /admin/notes            -> find().sort({ _id: -1 })
 */
noteSchema.index({ owner: 1, _id: -1 });

module.exports = model('Note', noteSchema);
