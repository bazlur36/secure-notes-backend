/*
 * End-to-end smoke test against a running API (local or deployed).
 * Usage: API_URL=http://localhost:5000/api npm run smoke   (requires seeded data)
 */
const BASE = process.env.API_URL || 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function check(label, cond, extra) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${JSON.stringify(extra)}` : ''}`);
}

(async () => {
  const stamp = Date.now();
  let r;

  r = await call('GET', '/health');
  check('health', r.status === 200);

  // --- auth ---
  r = await call('POST', '/auth/register', {
    body: { name: 'Smoke', email: `smoke${stamp}@example.com`, password: 'Smoke@1234', interests: ['Chess', 'chess', 'smoke'], role: 'admin' },
  });
  check('register rejects unknown field "role" (no privilege escalation)', r.status === 400, r.body);

  r = await call('POST', '/auth/register', {
    body: { name: 'Smoke', email: `smoke${stamp}@example.com`, password: 'Smoke@1234', interests: ['Chess', 'chess', 'smoke'] },
  });
  check('register -> 201, role=user, interests normalized', r.status === 201 && r.body.user.role === 'user' &&
    JSON.stringify(r.body.user.interests) === '["chess","smoke"]' && !('password' in r.body.user), r.body);
  const smokeToken = r.body.token;
  const smokeId = r.body.user._id;

  r = await call('POST', '/auth/register', { body: { name: 'Dup', email: `smoke${stamp}@example.com`, password: 'Smoke@1234' } });
  check('duplicate email -> 409', r.status === 409, r.body);

  r = await call('POST', '/auth/login', { body: { email: { $gt: '' }, password: 'x' } });
  check('NoSQL injection in login -> 400', r.status === 400, r.body);

  r = await call('POST', '/auth/login', { body: { email: 'user@example.com', password: 'wrong-pass' } });
  check('wrong password -> 401', r.status === 401);

  r = await call('POST', '/auth/login', { body: { email: 'user@example.com', password: 'User@12345' } });
  check('user login', r.status === 200 && r.body.token);
  const userToken = r.body.token;
  const userId = r.body.user._id;

  r = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'Admin@12345' } });
  check('admin login', r.status === 200 && r.body.user.role === 'admin');
  const adminToken = r.body.token;

  r = await call('GET', '/auth/me', { token: userToken });
  check('GET /auth/me', r.status === 200 && r.body.user._id === userId);
  r = await call('GET', '/notes');
  check('no token -> 401', r.status === 401);
  r = await call('GET', '/notes', { token: 'garbage' });
  check('bad token -> 401', r.status === 401);

  // --- notes ---
  r = await call('POST', '/notes', { token: smokeToken, body: { title: 'Smoke note', content: 'hello' } });
  check('create note', r.status === 201);
  const noteId = r.body.data._id;

  r = await call('GET', '/notes?page=1&limit=5', { token: smokeToken });
  check('list my notes (paginated)', r.status === 200 && r.body.meta.total === 1 && r.body.data[0]._id === noteId, r.body);

  r = await call('GET', '/notes?limit=2&page=2', { token: userToken });
  check('pagination meta', r.status === 200 && r.body.meta.page === 2 && r.body.meta.limit === 2 && r.body.data.length <= 2, r.body.meta);

  r = await call('GET', `/notes/${noteId}`, { token: userToken });
  check("other user cannot read someone else's note -> 404", r.status === 404);
  r = await call('PATCH', `/notes/${noteId}`, { token: userToken, body: { title: 'hacked' } });
  check("other user cannot update someone else's note -> 404", r.status === 404);
  r = await call('DELETE', `/notes/${noteId}`, { token: userToken });
  check("other user cannot delete someone else's note -> 404", r.status === 404);
  r = await call('GET', `/notes/${noteId}`, { token: adminToken });
  check("admin can view anyone's note", r.status === 200);
  r = await call('GET', '/notes/not-an-id', { token: userToken });
  check('invalid id -> 400', r.status === 400);

  r = await call('PATCH', `/notes/${noteId}`, { token: smokeToken, body: { title: 'Updated' } });
  check('owner updates note', r.status === 200 && r.body.data.title === 'Updated');

  // --- admin ---
  r = await call('GET', '/admin/users', { token: userToken });
  check('non-admin -> 403 on admin routes', r.status === 403);
  r = await call('GET', '/admin/users?limit=5', { token: adminToken });
  check('admin lists users', r.status === 200 && r.body.data.length === 5 && r.body.meta.total >= 62 &&
    r.body.data.every((u) => !('password' in u)), r.body.meta);
  r = await call('GET', '/admin/notes?limit=3', { token: adminToken });
  check('admin lists all notes', r.status === 200 && r.body.data.length === 3 && r.body.data[0].owner.email);
  r = await call('GET', `/admin/notes?owner=${smokeId}`, { token: adminToken });
  check('admin lists notes filtered by owner', r.status === 200 && r.body.meta.total === 1);

  r = await call('POST', '/admin/users', {
    token: adminToken,
    body: { name: 'Temp', email: `temp${stamp}@example.com`, password: 'Temp@12345', role: 'admin', interests: ['zz'] },
  });
  check('admin creates user', r.status === 201 && r.body.data.role === 'admin');
  const tempId = r.body.data._id;
  r = await call('PATCH', `/admin/users/${tempId}`, { token: adminToken, body: { role: 'user', name: 'Temp2' } });
  check('admin updates user', r.status === 200 && r.body.data.role === 'user' && r.body.data.name === 'Temp2');
  r = await call('GET', `/admin/users/${tempId}`, { token: adminToken });
  check('admin gets user', r.status === 200);

  // --- posts & aggregations ---
  r = await call('POST', '/posts', { token: smokeToken, body: { title: 'Hello', body: 'My first post' } });
  check('create post', r.status === 201);
  r = await call('GET', '/posts?limit=3');
  check('public posts list (no auth)', r.status === 200 && r.body.data.length === 3);

  r = await call('GET', `/users/${smokeId}/posts`);
  check('Scenario 2: user posts via $lookup', r.status === 200 && r.body.user.name === 'Smoke' &&
    r.body.data.length === 1 && r.body.meta.total === 1, r.body);
  r = await call('GET', '/users/000000000000000000000000/posts');
  check('Scenario 2: unknown user -> 404', r.status === 404);

  r = await call('GET', '/users/grouped-by-interest?limit=20', { token: userToken });
  check('Scenario 1: grouped by interest', r.status === 200 && r.body.data.length > 0 &&
    r.body.data.every((g) => g.interest && g.userCount >= g.users.length), r.body.meta);
  r = await call('GET', '/users/grouped-by-interest?interest=smoke', { token: userToken });
  check('Scenario 1: filtered by interest', r.status === 200 && r.body.data.length === 1 &&
    r.body.data[0].interest === 'smoke' && r.body.data[0].users.some((u) => u._id === smokeId), r.body);

  r = await call('GET', `/users/${smokeId}`);
  check('public profile', r.status === 200 && !('email' in r.body.data));

  // --- cleanup / cascade ---
  r = await call('DELETE', `/admin/users/${smokeId}`, { token: adminToken });
  check('admin deletes user', r.status === 204);
  r = await call('GET', `/admin/notes?owner=${smokeId}`, { token: adminToken });
  check("cascade: deleted user's notes removed", r.body.meta.total === 0);
  r = await call('GET', `/users/${smokeId}/posts`);
  check('deleted user -> 404', r.status === 404);
  r = await call('GET', '/notes', { token: smokeToken });
  check("deleted user's token no longer works", r.status === 401);
  await call('DELETE', `/admin/users/${tempId}`, { token: adminToken });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
