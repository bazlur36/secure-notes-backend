# Secure Notes API (Backend)

A REST API for a note-taking platform with JWT authentication, role-based access control
(`user` / `admin`), and MongoDB indexes and aggregation pipelines designed so that **every query is
served by an index and no index is unnecessary**.

- **Stack:** Node.js 18+, Express 5, MongoDB with Mongoose 9, JWT (`jsonwebtoken`), `bcryptjs`, `zod`
- **Live API:** https://secure-notes-frontend-lovat.vercel.app/api/health &nbsp;·&nbsp; **Frontend:** https://secure-notes-frontend-lovat.vercel.app &nbsp;·&nbsp; **Frontend repo:** https://github.com/bazlur36/secure-notes-frontend

---

## Quick start (local)

```bash
# 1. MongoDB: local install, Docker, or an Atlas connection string
docker run -d --name notes-mongo -p 27017:27017 mongo:7.0

# 2. Configure and install
cp .env.example .env          # then set JWT_SECRET to a long random string
npm install

# 3. Seed demo data (wipes users/notes/posts), then run
npm run seed
npm run dev                   # http://localhost:5000/api/health
```

| Script | Purpose |
|---|---|
| `npm run dev` / `npm start` | Run the API (watch mode / production) |
| `npm run seed` | Reset the DB with demo data and sync indexes |
| `npm run explain` | Run every list/read query and both aggregations through `explain('executionStats')` |
| `npm run sync-indexes` | Build declared indexes and **drop any index not declared in the schemas** |
| `npm run smoke` | 38-check end-to-end test against a running API (`API_URL=... npm run smoke`) |

**Seeded accounts**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@example.com` | `Admin@12345` |
| User | `user@example.com` | `User@12345` |

### Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGO_URI` | ✔ | – | MongoDB connection string |
| `JWT_SECRET` | ✔ | – | Long random string |
| `JWT_EXPIRES_IN` | | `1d` | Token lifetime |
| `BCRYPT_ROUNDS` | | `12` | bcrypt cost factor |
| `CORS_ORIGIN` | | `http://localhost:5173` | Comma-separated list of allowed frontend origins |
| `PORT` | | `5000` | Set automatically by Render |

---

## Roles & permissions

| Capability | User | Admin |
|---|:-:|:-:|
| Create / update / delete / list **own** notes | ✔ | ✔ |
| View **everyone's** notes | | ✔ |
| Add / update / remove / list users | | ✔ |
| Create posts, view all posts | ✔ | ✔ |

- Public registration **always** creates a `user`. A `role` field in the body is rejected (strict schema). Only admins can create admins.
- Ownership is enforced **inside the query** (`findOneAndUpdate({ _id, owner: req.user._id })`), not by a separate read-then-check.
- Another user's note returns **404, not 403**, so the API does not confirm that a note id exists.
- The auth middleware loads the user from the DB on every request (`_id` index). Deleted users and role changes take effect immediately, even with a valid token.

---

## API

All endpoints are prefixed with `/api`. Authenticated routes need `Authorization: Bearer <token>`.
Every list endpoint is paginated with `?page=1&limit=10` (limit is capped at 100) and returns:

```json
{ "data": [ ... ], "meta": { "page": 1, "limit": 10, "total": 57, "totalPages": 6 } }
```

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | – | Health check |
| POST | `/auth/register` | – | `{ name, email, password, interests? }` → `{ token, user }` |
| POST | `/auth/login` | – | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | user | Current user |
| PATCH | `/auth/me` | user | Update own `name`, `interests`, `password` |
| GET | `/notes` | user | **Own** notes (paginated, newest first) |
| POST | `/notes` | user | `{ title, content? }` |
| GET | `/notes/:id` | user | Own note (admins: any note) |
| PATCH | `/notes/:id` | user | Update own note |
| DELETE | `/notes/:id` | user | Delete own note |
| GET | `/admin/users` | admin | List all users (paginated) |
| POST | `/admin/users` | admin | `{ name, email, password, role?, interests? }` |
| GET | `/admin/users/:id` | admin | Get a user |
| PATCH | `/admin/users/:id` | admin | Update name / email / password / role / interests |
| DELETE | `/admin/users/:id` | admin | Remove a user (also removes their notes and posts) |
| GET | `/admin/notes` | admin | **Everyone's** notes (paginated, optional `?owner=<userId>`) |
| GET | `/users/:id` | – | Public profile (name, interests) |
| GET | `/users/grouped-by-interest` | user | **Scenario 1.** `?interest=&page=&limit=&usersPerGroup=` |
| GET | `/users/:id/posts` | – | **Scenario 2.** A user's posts via `$lookup` (paginated) |
| GET | `/posts` | – | Public post feed (paginated) |
| GET | `/posts/:id` | – | Single post |
| POST | `/posts` | user | `{ title, body }` |
| DELETE | `/posts/:id` | user | Author (or admin) deletes a post |

Errors always look like `{ "error": { "message": "...", "details": [...] } }`. Status codes: 400 validation /
bad id / malformed JSON, 401 unauthenticated, 403 forbidden, 404 not found, 409 duplicate email, 429 rate limited.

---

## Indexing strategy

All indexes are declared with `schema.index()` in [`src/models`](src/models). No index is created through
field options such as `unique: true` or `index: true`. There are **3 custom indexes in total**:

| Collection | Index | Queries it serves |
|---|---|---|
| users | `{ email: 1 }` **unique** | Login `findOne({ email })`; enforces unique emails on register / admin create / update |
| users | `{ interests: 1 }` (multikey) | Scenario 1 aggregation, leading `$match` on `interests` |
| notes | `{ owner: 1, _id: -1 }` | "My notes" `find({ owner }).sort({ _id: -1 })`, its `countDocuments({ owner })` (COUNT_SCAN), admin `?owner=` filter, cascade `deleteMany({ owner })` |
| posts | `{ author: 1, _id: -1 }` | Scenario 2 `$lookup` (equality on `author` + sort by `_id`), cascade `deleteMany({ author })` |

**Served by the default `_id` index (no extra index needed):** profile / `me` / auth middleware (`findById`),
get / update / delete a note or post by id, the admin user list, the admin all-notes list, the public post feed,
and the `$match { _id }` in Scenario 2.

### Design decisions

- **Lists sort by `_id`, not `createdAt`.** An ObjectId starts with its creation timestamp, so `_id: -1` *is* "newest first".
  This removes the need for any `createdAt` index, and unfiltered lists reuse the built-in `_id` index.
- **`{ owner: 1, _id: -1 }` rather than `{ owner: 1 }`.** This follows the ESR rule (Equality → Sort → Range). With only
  `{ owner: 1 }`, MongoDB would have to fetch all of a user's notes and sort them in memory before applying skip/limit.
  The compound index returns them already in order, so the scan stops after `skip + limit` keys.
  The same index also serves any query on `owner` alone (prefix rule), so adding a separate `{ owner: 1 }` would be redundant.
- **Counts:** filtered counts (`countDocuments({ owner })`) run as a `COUNT_SCAN` on the index without touching documents.
  Unfiltered totals use `estimatedDocumentCount()`, which reads collection metadata and does no scan.
- **Not indexed on purpose:** `role` (no query filters by it; a 2-value field is also very unselective), `name`,
  `createdAt`, `title`. No query needs them.
- `npm run sync-indexes` drops anything not declared in the schemas, so the database always matches the code.

---

## Aggregation pipelines

Both pipelines are in [`src/services/aggregations.js`](src/services/aggregations.js).

### Scenario 1: users grouped by interest (exactly one `aggregate()` call)

`GET /api/users/grouped-by-interest?interest=chess&page=1&limit=10&usersPerGroup=20`

```js
User.aggregate([
  { $match: interest ? { interests: interest } : { interests: { $type: 'string' } } }, // IXSCAN interests_1
  { $project: { _id: 1, name: 1, interests: 1 } },
  { $unwind: '$interests' },
  ...(interest ? [{ $match: { interests: interest } }] : []),   // drop the user's other interests
  { $group: {
      _id: '$interests',
      userCount: { $sum: 1 },
      users: { $topN: { n: usersPerGroup, sortBy: { name: 1, _id: 1 }, output: { _id: '$_id', name: '$name' } } },
  } },
  { $sort: { userCount: -1, _id: 1 } },
  { $facet: {                                        // page + total in the SAME call
      data: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 0, interest: '$_id', userCount: 1, users: 1 } }],
      meta: [{ $count: 'total' }],
  } },
]);
```

- The controller makes **only this one call**. Pagination metadata comes from `$facet`, not from a second `countDocuments`.
- **Index use.** The leading `$match` always uses the multikey `{ interests: 1 }` index.
  - With `?interest=`, it is a point lookup (`["chess","chess"]`).
  - Without one, `$type: 'string'` is still an index range scan. It skips users with no interests entirely.
  - Grouping *all* users necessarily reads every user that has interests. No index can avoid that, but the index keeps it bounded.
- `$project` runs before `$unwind` to keep the documents in the pipeline small.
- `$topN` limits each group's member list to `usersPerGroup` and orders it by name. An unbounded `$push` could exceed the 16 MB document limit on large data.

### Scenario 2: a user's posts (single pipeline with `$lookup`)

`GET /api/users/:id/posts?page=1&limit=10`

```js
User.aggregate([
  { $match: { _id: userId } },                            // _id index
  { $project: { name: 1, interests: 1 } },
  { $lookup: {
      from: 'posts', localField: '_id', foreignField: 'author', as: 'posts',
      pipeline: [                                          // runs with an implicit { author: userId } match
        { $sort: { _id: -1 } },                            // -> served by { author: 1, _id: -1 }
        { $facet: { data: [{ $skip: skip }, { $limit: limit }, { $project: { author: 0 } }],
                    meta: [{ $count: 'total' }] } },
      ],
  } },
  { $set: { posts: { $first: '$posts' } } },
  { $project: { _id: 0, user: { _id: '$_id', name: '$name', interests: '$interests' },
                posts: '$posts.data', total: { $ifNull: [{ $first: '$posts.meta.total' }, 0] } } },
]);
```

The `$lookup` uses `localField`/`foreignField` together with a sub-pipeline (MongoDB 5.0+). The equality on `author` and the
`$sort` on `_id` are both served by `{ author: 1, _id: -1 }`, as `explain()` confirms (`indexesUsed`, `collectionScans=0`).
Starting from the users collection means an unknown user returns 404, and the result includes the author's profile.

---

## Verification: `npm run explain`

Output on the seeded dataset (62 users, ~400 notes, ~100 posts). ✓ means no `COLLSCAN`:

```text
Declared indexes:
  users: {"_id":1}  {"email":1}  {"interests":1}
  notes: {"_id":1}  {"owner":1,"_id":-1}
  posts: {"_id":1}  {"author":1,"_id":-1}

✓ Login: users.findOne({ email })
   stages : LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN
   index  : email_1
   keysExamined=1 docsExamined=1

✓ Profile: users.findById(id)
   stages : PROJECTION_SIMPLE > IDHACK
   index  : _id_ (IDHACK fast path)
   keysExamined=1 docsExamined=1

✓ Admin list users: users.find().sort({_id:-1})
   stages : LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN
   index  : _id_
   keysExamined=10 docsExamined=10

✓ My notes: notes.find({owner}).sort({_id:-1})
   stages : LIMIT > FETCH > IXSCAN
   index  : owner_1__id_-1
   keysExamined=5 docsExamined=5

✓ My notes count: notes.countDocuments({owner})
   stages : COUNT_SCAN
   index  : owner_1__id_-1
   keysExamined=6 docsExamined=0

✓ Get note: notes.findOne({_id, owner})
   stages : LIMIT > FETCH > IXSCAN
   index  : _id_
   keysExamined=1 docsExamined=1

✓ Admin all notes: notes.find().sort({_id:-1})
   stages : LIMIT > FETCH > IXSCAN
   index  : _id_
   keysExamined=10 docsExamined=10

✓ Public posts: posts.find().sort({_id:-1})
   stages : LIMIT > FETCH > IXSCAN
   index  : _id_
   keysExamined=10 docsExamined=10

✓ Scenario 1 (filtered ?interest=chess)
   stages : PROJECTION_SIMPLE > FETCH > IXSCAN
   index  : interests_1
   keysExamined=23 docsExamined=23

✓ Scenario 1 (all interests)
   stages : PROJECTION_SIMPLE > FETCH > IXSCAN
   index  : interests_1
   keysExamined=148 docsExamined=56

✓ Scenario 2 ($lookup user posts)
   stages : PROJECTION_SIMPLE > IDHACK
   index  : _id_ (IDHACK fast path)
   keysExamined=1 docsExamined=1
   $lookup: indexesUsed=["author_1__id_-1"] collectionScans=0 keysExamined=2 docsExamined=2
```

---

## Security

- **Passwords** are hashed with bcrypt (cost 12, unique salt per hash). They are `select: false` in the schema and removed from all JSON output.
- **Login** returns the same 401 for an unknown email and a wrong password. When the email doesn't exist, the password is still compared against a dummy hash, so response timing does not reveal which emails are registered.
- **JWT** is HS256 only (the algorithm is pinned on verify) and short-lived (`JWT_EXPIRES_IN`, default 1 day). The payload contains only `sub` and `role`.
- **Validation** uses strict `zod` schemas on every request body. Unknown fields are rejected, which blocks mass-assignment (e.g. `role`).
  Strict types also block NoSQL operator injection such as `{ "email": { "$gt": "" } }`. Ids are checked as 24-hex ObjectIds.
- **HTTP hardening:**
  - `helmet` sets security headers.
  - CORS uses an allow-list.
  - Bodies are limited to 100 kB.
  - Register and login are rate limited to 20 requests per 15 min per IP, with `trust proxy` set for Render.
- Admins cannot delete their own account or remove their own admin role, so the system can't be left without an admin by accident.

---

## Deployment

### MongoDB Atlas (free M0)
1. Create a cluster and a database user, and allow network access from `0.0.0.0/0` (Render free instances have no static IP).
2. Copy the connection string and add a database name: `mongodb+srv://<user>:<pass>@<cluster>/secure_notes?retryWrites=true&w=majority`.

### Render (free web service)
1. **New → Web Service**, then connect this repository.
2. Set **Build command** to `npm install` and **Start command** to `npm start`.
3. Set the environment variables `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production`, and `CORS_ORIGIN=https://<your-frontend>.vercel.app`.
   (The live frontend proxies `/api/*` to Render through a Vercel rewrite, so browser calls are same-origin. The live API URL above goes through that proxy and runs on Render's free tier, so the first request after idle takes ~30–50 s.)
4. Seed once from your machine with `MONGO_URI=<atlas uri> npm run seed`. Indexes are built automatically on startup, and `npm run sync-indexes` builds them explicitly.

> Render's free tier sleeps after ~15 min of inactivity. The first request after that can take ~30–50 s.

## Project structure

```
src/
  app.js                 Express app: security middleware, routes, error handling
  server.js              DB connection + HTTP server + graceful shutdown
  config/                env + Mongo connection
  models/                User, Note, Post (all indexes declared here with schema.index)
  services/aggregations.js  Scenario 1 & 2 pipelines
  controllers/           auth, notes, admin, users, posts
  middleware/            authenticate / authorize, zod validation, error handler
  routes/index.js        all routes
  validators.js          zod request schemas
  utils/                 pagination, ObjectId parsing, bcrypt, JWT helpers
  scripts/               seed, explain, sync-indexes, smoke test
```
