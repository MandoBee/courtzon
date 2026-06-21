import { z } from 'zod';

export const CreateRoleSchema = z.object({
  organisationId: z.number().int().positive().nullable().optional(),
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateRoleSchema = CreateRoleSchema.partial();

export const AssignRoleSchema = z.object({
  userId: z.number().int().positive(),
  roleId: z.number().int().positive(),
  scopes: z.array(z.object({
    scopeType: z.enum(['organisation','branch','resource']),
    scopeId: z.number().int().positive(),
  })).optional(),
});

export const SetPermissionSchema = z.object({
  permissionId: z.number().int().positive(),
});

export const CreatePermissionSchema = z.object({
  moduleId: z.number().int().positive(),
  permissionKey: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const UpdatePermissionSchema = CreatePermissionSchema.partial();

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
