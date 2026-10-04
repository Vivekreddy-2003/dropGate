const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['shopper', 'merchant'], {
    errorMap: () => ({ message: 'Role must be shopper or merchant' }),
  }),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

module.exports = { registerSchema, loginSchema };
