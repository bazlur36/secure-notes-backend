const { z } = require('zod');

const email = z.email().max(254).transform((v) => v.trim().toLowerCase());
const password = z.string().min(8, 'Password must be at least 8 characters').max(72); // bcrypt limit
const name = z.string().trim().min(1).max(100);
const interests = z
  .array(z.string().trim().toLowerCase().min(1).max(50))
  .max(20)
  .transform((arr) => [...new Set(arr)]); // de-duplicate

const registerSchema = z.strictObject({ name, email, password, interests: interests.optional() });
const loginSchema = z.strictObject({ email, password: z.string().min(1).max(72) });
const updateMeSchema = z
  .strictObject({ name: name.optional(), interests: interests.optional(), password: password.optional() })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

const adminCreateUserSchema = z.strictObject({
  name,
  email,
  password,
  role: z.enum(['user', 'admin']).default('user'),
  interests: interests.optional(),
});
const adminUpdateUserSchema = z
  .strictObject({
    name: name.optional(),
    email: email.optional(),
    password: password.optional(),
    role: z.enum(['user', 'admin']).optional(),
    interests: interests.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

const createNoteSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(20000).default(''),
});
const updateNoteSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().max(20000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

const createPostSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateMeSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  createNoteSchema,
  updateNoteSchema,
  createPostSchema,
};
