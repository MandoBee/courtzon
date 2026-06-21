export interface StoredFile {
  filePath: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface StorageProvider {
  save(buffer: Buffer, relativePath: string, mimeType: string): Promise<StoredFile>;
  delete(relativePath: string): Promise<void>;
  getUrl(relativePath: string): string;
}
