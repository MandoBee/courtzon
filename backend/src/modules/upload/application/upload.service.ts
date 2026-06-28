import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { SharpProcessor } from '../infrastructure/sharp-processor.js';
import { createStorageProvider } from '../infrastructure/storage.factory.js';
import { uploadRepository } from '../infrastructure/upload.repository.js';
import type { StorageProvider } from '../infrastructure/storage-provider.interface.js';
import type { ProcessOptions } from '../infrastructure/sharp-processor.js';
import { recordAudit } from '../../audit-log/index.js';

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/avif', 'application/pdf',
];

const BLOCKED_EXTENSIONS = [
  '.svg', '.svgz', '.html', '.htm', '.js', '.jsx', '.ts', '.tsx',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phar',
  '.asp', '.aspx', '.jsp', '.jspx', '.war', '.cfm', '.shtml',
  '.exe', '.dll', '.bat', '.cmd', '.sh', '.bash', '.zsh', '.ksh',
  '.ps1', '.psm1', '.psd1', '.vbs', '.vbe', '.wsf', '.wsh',
  '.pl', '.py', '.pyc', '.rb', '.jar', '.class',
  '.msi', '.msp', '.scr', '.cpl', '.app', '.com',
  '.swf', '.fla', '.xap',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

class UploadService {
  private processor: SharpProcessor;
  private storage: StorageProvider;

  constructor() {
    this.processor = new SharpProcessor();
    this.storage = createStorageProvider();
  }

  private validateFile(buffer: Buffer, mimeType: string, originalName: string): void {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw Object.assign(new Error(`Unsupported file type: ${mimeType}`), { statusCode: 400 });
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw Object.assign(new Error('File too large (max 20MB)'), { statusCode: 400 });
    }

    const ext = extname(originalName).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw Object.assign(new Error(`File extension .${ext} is not allowed`), { statusCode: 400 });
    }

    if (mimeType === 'image/svg+xml' || ext === '.svg' || ext === '.svgz') {
      throw Object.assign(new Error('SVG files are not allowed for security reasons'), { statusCode: 400 });
    }

    this.validateMagicBytes(buffer, mimeType);
  }

  private validateMagicBytes(buffer: Buffer, mimeType: string): void {
    const header = buffer.slice(0, 8).toString('hex').toLowerCase();
    const header4_12 = buffer.slice(4, 12).toString('hex').toLowerCase();
    const signatureMap: Record<string, string[]> = {
      'image/jpeg': ['ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2', 'ffd8ffe3', 'ffd8ffe8'],
      'image/png': ['89504e47'],
      'image/webp': ['52494646'],
      'image/gif': ['47494638'],
      'image/heic': ['00000018', '0000001c'],
      'image/heif': ['00000018', '0000001c'],
      'image/avif': ['6674797061766966', '6674797061766973'],
      'application/pdf': ['25504446'],
    };

    const validSignatures = signatureMap[mimeType];
    if (!validSignatures) return;
    const checkBuf = mimeType === 'image/avif' ? header4_12 : header;
    const matched = validSignatures.some(sig => checkBuf.startsWith(sig));
    if (!matched) {
      throw Object.assign(new Error('File content does not match declared MIME type'), { statusCode: 400 });
    }
  }

  async upload(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
    entityType: string,
    entityId: number,
    fileCategory: string,
    options?: ProcessOptions,
  ) {
    this.validateFile(buffer, mimeType, originalName);

    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';

    let processedBuffer: Buffer;
    let outputMimeType: string;
    let width: number | undefined;
    let height: number | undefined;

    if (isImage) {
      const result = await this.processor.process(buffer, {
        maxWidth: options?.maxWidth ?? 1920,
        maxHeight: options?.maxHeight ?? 1920,
        quality: options?.quality ?? 80,
        fit: options?.fit,
      });
      processedBuffer = result.buffer;
      outputMimeType = result.mimeType;
      width = result.width;
      height = result.height;
    } else if (isPdf) {
      processedBuffer = buffer;
      outputMimeType = mimeType;
    } else {
      processedBuffer = buffer;
      outputMimeType = mimeType;
    }

    const ext = outputMimeType === 'image/webp' ? 'webp'
      : outputMimeType === 'image/png' ? 'png'
      : outputMimeType === 'image/jpeg' ? 'jpg'
      : outputMimeType === 'application/pdf' ? 'pdf'
      : 'bin';

    const filename = `${randomUUID()}.${ext}`;
    const relativePath = `${entityType}/${fileCategory}/${filename}`;
    const stored = await this.storage.save(processedBuffer, relativePath, outputMimeType);

    const upload = await uploadRepository.create({
      entityType,
      entityId,
      fileCategory,
      originalName,
      mimeType: outputMimeType,
      filePath: stored.filePath,
      fileSize: stored.size,
      width,
      height,
    });

    recordAudit({
      actorId: entityId,
      action: 'UPLOAD.CREATE',
      entityType: 'upload',
      entityId: upload.id,
      afterState: { entityType, fileCategory, mimeType: outputMimeType, fileSize: stored.size },
    });

    return {
      id: upload.id,
      publicId: upload.public_id,
      url: stored.filePath,
      width: upload.width,
      height: upload.height,
      mimeType: upload.mime_type,
    };
  }

  async getByEntity(entityType: string, entityId: number, fileCategory?: string) {
    return uploadRepository.findByEntity(entityType, entityId, fileCategory);
  }

  async delete(id: number) {
    const upload = await uploadRepository.findById(id);
    if (!upload) throw Object.assign(new Error('Upload not found'), { statusCode: 404 });

    const relativePath = upload.file_path.replace('/uploads/', '');
    try { await this.storage.delete(relativePath); } catch { /* ignore */ }
    await uploadRepository.delete(id);

    recordAudit({
      actorId: null,
      action: 'UPLOAD.DELETE',
      entityType: 'upload',
      entityId: id,
      afterState: { filePath: upload.file_path },
    });
  }

  async replaceEntityFile(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
    entityType: string,
    entityId: number,
    fileCategory: string,
    options?: ProcessOptions,
  ) {
    const existing = await uploadRepository.findByEntity(entityType, entityId, fileCategory);
    for (const row of existing) {
      const relativePath = row.file_path.replace('/uploads/', '');
      try { await this.storage.delete(relativePath); } catch { /* ignore */ }
    }
    await uploadRepository.deleteByEntity(entityType, entityId, fileCategory);

    return this.upload(buffer, mimeType, originalName, entityType, entityId, fileCategory, options);
  }
}

export const uploadService = new UploadService();
