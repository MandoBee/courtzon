import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { StorageProvider, StoredFile } from './storage-provider.interface.js';
import { env } from '../../../config/env.js';

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      throw new Error('S3/R2 storage requires S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY');
    }

    this.bucket = env.S3_BUCKET;
    this.publicBaseUrl =
      process.env.S3_PUBLIC_URL?.replace(/\/$/, '') ||
      `${env.S3_ENDPOINT?.replace(/\/$/, '')}/${this.bucket}`;

    this.client = new S3Client({
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: env.STORAGE_PROVIDER === 'r2' || !!env.S3_ENDPOINT,
    });
  }

  async save(buffer: Buffer, relativePath: string, mimeType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return {
      filePath: `/uploads/${relativePath}`,
      size: buffer.length,
      mimeType,
    };
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
      }),
    );
  }

  getUrl(relativePath: string): string {
    return `${this.publicBaseUrl}/${relativePath}`;
  }
}
