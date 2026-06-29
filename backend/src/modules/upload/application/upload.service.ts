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
    if (buffer.length < 4) {
      throw Object.assign(new Error(`File too small (${buffer.length} bytes) — expected at least 4 bytes for MIME detection`), { statusCode: 400 });
    }

    const header8 = buffer.slice(0, 8).toString('hex').toLowerCase();
    const header4_12 = buffer.slice(4, 12).toString('hex').toLowerCase();
    const header8_12 = buffer.slice(8, 12).toString('hex').toLowerCase();

    // JPEG: check SOI marker FF D8 FF followed by any valid marker byte.
    // Many JPEGs have APP0 (JFIF, E0) or APP1 (EXIF, E1) after SOI, but encoders
    // like Sharp put DQT (DB) right after SOI — all are valid JPEG structures.
    const isValidJpegMarker4th = (byte: string): boolean => {
      const b = parseInt(byte, 16);
      return (b >= 0xC0 && b <= 0xCF) || (b >= 0xE0 && b <= 0xEF) || [0xDB, 0xDD, 0xFE].includes(b);
    };

    const signatureMap: Record<string, (h8: string, h4_12: string, h8_12: string) => boolean> = {
      'image/jpeg': (h8) => h8.startsWith('ffd8ff') && isValidJpegMarker4th(h8.substring(6, 8)),
      'image/png': (h8) => h8.startsWith('89504e47'),
      'image/webp': (h8, _h4_12, h8_12) => h8.startsWith('52494646') && h8_12.startsWith('57454250'),
      'image/gif': (h8) => h8.startsWith('47494638'),
      'image/heic': (_h8, h4_12) => h4_12.startsWith('66747970') && (h4_12.startsWith('66747970686569') || h4_12.startsWith('6674797068656978') || h4_12.startsWith('667479706865696d') || h4_12.startsWith('6674797068656973') || h4_12.startsWith('667479706d696631')),
      'image/heif': (_h8, h4_12) => h4_12.startsWith('66747970') && (h4_12.startsWith('667479706d696631') || h4_12.startsWith('6674797068656963') || h4_12.startsWith('6674797068656978')),
      'image/avif': (_h8, h4_12) => h4_12.startsWith('66747970') && (h4_12.startsWith('6674797061766966') || h4_12.startsWith('6674797061766973')),
      'application/pdf': (h8) => h8.startsWith('25504446'),
    };

    const validator = signatureMap[mimeType];
    if (!validator) return;

    const matched = validator(header8, header4_12, header8_12);
    if (!matched) {
      throw Object.assign(new Error(
        `File content does not match declared MIME type: detected magic bytes do not correspond to ${mimeType}`
      ), { statusCode: 400, details: { declaredMime: mimeType, detectedHeader: header8 } });
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
