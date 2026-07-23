export interface ReferenceRecord {
  id: number;
  code?: string;
  name: string;
  is_active: boolean;
  sort_order?: number;
}

export function isActiveReference(record: ReferenceRecord): boolean {
  return record.is_active;
}
