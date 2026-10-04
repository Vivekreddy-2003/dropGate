const { z } = require('zod');

const createHoldSchema = z.object({
  skuId: z.string().uuid('skuId must be a valid UUID'),
  qty: z.coerce.number().int().min(1).max(10).optional().default(1),
  // admitToken: z.string().optional(), // Category C step 9.2+
});

const payHoldSchema = z.object({
  result: z.enum(['success', 'fail'], {
    errorMap: () => ({ message: 'result must be success or fail' }),
  }),
});

module.exports = { createHoldSchema, payHoldSchema };
