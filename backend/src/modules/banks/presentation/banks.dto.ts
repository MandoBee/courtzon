import { z } from 'zod';

export const CreateBankSchema = z.object({
  countryId: z.number().int().positive(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(200).optional(),
  swift: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateBankSchema = z.object({
  countryId: z.number().int().positive().optional(),
  name: z.string().min(2).max(200).optional(),
  swift: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const CreateBankBranchSchema = z.object({
  bankId: z.number().int().positive(),
  name: z.string().min(2).max(200),
  address: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateBankBranchSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
