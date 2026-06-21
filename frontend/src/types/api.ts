import type { AxiosResponse } from 'axios';

/** Standard API body: `{ data: T }` (axios wraps this in `.data`). */
export interface ApiData<T> {
  data: T;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function unwrapBody<T>(response: AxiosResponse<T>): T {
  return response.data;
}

export function unwrapNestedData<T>(response: AxiosResponse<ApiData<T>>): T {
  return response.data.data;
}

export function unwrapPaginated<T>(
  response: AxiosResponse<PaginatedResult<T>>,
): PaginatedResult<T> {
  return response.data;
}
