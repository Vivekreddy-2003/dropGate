const { z } = require('zod');

const createDropSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens'),
  registrationOpensAt: z.string().datetime({ message: 'registrationOpensAt must be ISO datetime' }),
  goesLiveAt: z.string().datetime({ message: 'goesLiveAt must be ISO datetime' }),
  holdTtlSeconds: z.number().int().positive(),
  maxPerUser: z.number().int().positive(),
  admitBatchSize: z.number().int().positive(),
  sku: z.object({
    name: z.string().min(1),
    totalQty: z.number().int().positive(),
    priceCents: z.number().int().positive(),
  }),
});

module.exports = { createDropSchema };
