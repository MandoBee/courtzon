export type UUID = string;
export type Timestamp = string;

export interface TenantContext {
  organisationId?: number;
  clubId?: number;
  branchId?: number;
}

export interface UserContext {
  userId: number;
  role: string;
  tenant: TenantContext;
}

export interface PaginationInput {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SortInput {
  field: string;
  order: 'asc' | 'desc';
}

export interface FilterInput {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith' | 'endsWith';
  value: unknown;
}
