export type UploadStatus = 'pending' | 'completed' | 'failed';

export interface UploadRecord {
  id: number;
  entity_type: string;
  entity_id: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  status: UploadStatus;
  aggregate_version: number;
}

export function isAllowedMimeType(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimeType);
}

export function maxFileSizeBytes(size: number, maxBytes: number): boolean {
  return size <= maxBytes;
}
