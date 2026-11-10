const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    // Never returned by queries unless explicitly requested with .select('+password')
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    interests: { type: [String], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/*
 * INDEXES — every index is declared here with schema.index() (no `unique: true` /
 * `index: true` on fields) so the full indexing strategy is visible in one place.
 *
 * 1. { email: 1 } unique
 *    - POST /auth/login           -> findOne({ email })
 *    - register / admin create    -> duplicate-email protection (E11000)
 *
 * 2. { interests: 1 }  (multikey)
 *    - Scenario 1 aggregation     -> leading $match on `interests` (IXSCAN)
 *
 * Covered by the default { _id: 1 } index (no extra index needed):
 *    - GET /users/:id, GET /auth/me, auth middleware (findById)
 *    - GET /admin/users           -> find().sort({ _id: -1 }) paginated
 *    - Scenario 2 aggregation     -> $match { _id }
 *
 * Deliberately NOT indexed: role, createdAt, name (no query filters/sorts on them).
 * Lists sort by _id because an ObjectId already encodes creation time.
 */
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ interests: 1 });

module.exports = model('User', userSchema);
