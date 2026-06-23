import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../../../database/mysql.js';
import { uploadService } from '../../upload/application/upload.service.js';
import { sendEmail } from '../../../shared/services/mailer.service.js';
import { recordAudit } from '../../audit-log/index.js';
import { cmsRepository } from '../infrastructure/repositories/cms.repository.js';
import {
  CONTACT_MAX_FILE_BYTES,
  CONTACT_MAX_FILES,
  CONTACT_ACCEPTED_TYPES,
  ContactSubmitSchema,
  GENERAL_SUBJECTS,
  REFERRAL_SOURCES,
  type ContactSubmitInput,
} from '../presentation/contact.dto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = join(__dirname, '..', '..', '..', '..', 'uploads');

export interface ContactUploadedFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

async function resolveSupportEmail(): Promise<string | null> {
  const pool = getPool();
  const [appRows] = await pool.execute(
    'SELECT value FROM app_settings WHERE setting_key = ? LIMIT 1',
    ['support_email'],
  ) as any[];
  if (appRows.length) {
    const raw = appRows[0].value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed === 'string' && parsed.includes('@')) return parsed.trim();
  }

  const [sysRows] = await pool.execute(
    'SELECT value FROM system_settings WHERE setting_key = ? LIMIT 1',
    ['platform.support_email'],
  ) as any[];
  if (sysRows.length) {
    const raw = sysRows[0].value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed === 'string' && parsed.includes('@')) return parsed.trim();
  }

  return null;
}

async function resolveDisplaySubject(subject: string, subjectOther: string | null): Promise<string> {
  if (subject === 'other') return subjectOther?.trim() || 'Other';
  if (subject.startsWith('sport:')) {
    const slug = subject.slice(6);
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT name FROM sports WHERE slug = ? LIMIT 1',
      [slug],
    ) as any[];
    return rows[0]?.name || slug.replace(/-/g, ' ');
  }
  const general = GENERAL_SUBJECTS.find((g) => g.value === subject);
  return general?.label || subject;
}

function referralLabel(value: string, other?: string | null): string {
  if (value === 'other') return other?.trim() || 'Other';
  return REFERRAL_SOURCES.find((r) => r.value === value)?.label || value;
}

function uploadPathFromUrl(filePath: string): string {
  const relative = filePath.replace(/^\/uploads\//, '');
  return join(UPLOAD_ROOT, relative);
}

function buildEmailHtml(
  data: ContactSubmitInput,
  countryName: string,
  displaySubject: string,
  attachmentNames: string[],
): string {
  const rows = [
    ['Name', data.fullName],
    ['Email', data.email],
    ['Country', countryName],
    ['Phone', data.phone],
    ['Subject', displaySubject],
    ['How they heard about us', referralLabel(data.referralSource, data.referralOther)],
    ['Message', data.message.replace(/\n/g, '<br>')],
  ];
  if (attachmentNames.length) {
    rows.push(['Attachments', attachmentNames.join(', ')]);
  }
  const bodyRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;font-weight:600;vertical-align:top;border-bottom:1px solid #eee;">${label}</td>` +
        `<td style="padding:8px 12px;border-bottom:1px solid #eee;">${value}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111;">
    <h2 style="color:#059669;">New Contact Form Submission</h2>
    <table style="border-collapse:collapse;width:100%;max-width:640px;">${bodyRows}</table>
  </body></html>`;
}

export const contactSubmissionService = {
  async getFormOptions() {
    return {
      generalSubjects: GENERAL_SUBJECTS,
      referralSources: REFERRAL_SOURCES,
      acceptedFileTypes: CONTACT_ACCEPTED_TYPES,
      acceptedFileTypesLabel:
        'JPEG, PNG, WebP, GIF, HEIC, or PDF (max 5 files, 5 MB each)',
      maxFiles: CONTACT_MAX_FILES,
      maxFileBytes: CONTACT_MAX_FILE_BYTES,
    };
  },

  async submit(input: ContactSubmitInput, files: ContactUploadedFile[], meta: { ip?: string }) {
    const parsed = ContactSubmitSchema.parse(input);
    const supportEmail = await resolveSupportEmail();
    if (!supportEmail) {
      throw Object.assign(new Error('Support email is not configured. Please contact the administrator.'), {
        statusCode: 503,
        errorCode: 'SUPPORT_EMAIL_NOT_CONFIGURED',
      });
    }

    if (files.length > CONTACT_MAX_FILES) {
      throw Object.assign(new Error(`Maximum ${CONTACT_MAX_FILES} attachments allowed`), { statusCode: 400 });
    }

    for (const file of files) {
      if (!CONTACT_ACCEPTED_TYPES.includes(file.mimeType as (typeof CONTACT_ACCEPTED_TYPES)[number])) {
        throw Object.assign(new Error(`File type not allowed: ${file.mimeType}`), { statusCode: 400 });
      }
      if (file.buffer.length > CONTACT_MAX_FILE_BYTES) {
        throw Object.assign(new Error('Each attachment must be 5 MB or smaller'), { statusCode: 400 });
      }
    }

    const pool = getPool();
    const [countryRows] = await pool.execute(
      'SELECT id, name FROM countries WHERE id = ? AND is_active = 1 LIMIT 1',
      [parsed.countryId],
    ) as any[];
    if (!countryRows.length) {
      throw Object.assign(new Error('Invalid country'), { statusCode: 400 });
    }
    const countryName = countryRows[0].name as string;

    const displaySubject = await resolveDisplaySubject(parsed.subject, parsed.subjectOther ?? null);

    const submissionId = await cmsRepository.createContactSubmission({
      name: parsed.fullName,
      email: parsed.email,
      countryId: parsed.countryId,
      phone: parsed.phone,
      subject: displaySubject,
      subjectOther: parsed.subject === 'other' ? parsed.subjectOther || null : null,
      message: parsed.message,
      referralSource: parsed.referralSource,
      referralOther: parsed.referralSource === 'other' ? parsed.referralOther || null : null,
    });

    const uploadedAttachments: Array<{ uploadId: number; originalName: string; path: string; mimeType: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uploaded = await uploadService.upload(
        file.buffer,
        file.mimeType,
        file.filename,
        'contact_submission',
        submissionId,
        'attachment',
        { maxWidth: 2560, maxHeight: 2560, quality: 90 },
      );
      await cmsRepository.linkContactAttachment(submissionId, uploaded.id, i);
      uploadedAttachments.push({
        uploadId: uploaded.id,
        originalName: file.filename,
        path: uploadPathFromUrl(uploaded.url),
        mimeType: uploaded.mimeType,
      });
    }

    const textBody = [
      `Name: ${parsed.fullName}`,
      `Email: ${parsed.email}`,
      `Country: ${countryName}`,
      `Phone: ${parsed.phone}`,
      `Subject: ${displaySubject}`,
      `How they heard about us: ${referralLabel(parsed.referralSource, parsed.referralOther)}`,
      '',
      parsed.message,
      '',
      uploadedAttachments.length
        ? `Attachments: ${uploadedAttachments.map((a) => a.originalName).join(', ')}`
        : '',
    ].join('\n');

    let emailError: string | null = null;
    try {
      await sendEmail({
        to: supportEmail,
        subject: `[CourtZon Contact] ${displaySubject} — ${parsed.fullName}`,
        body: textBody,
        html: buildEmailHtml(
          parsed,
          countryName,
          displaySubject,
          uploadedAttachments.map((a) => a.originalName),
        ),
        attachments: uploadedAttachments.map((a) => ({
          filename: a.originalName,
          path: a.path,
          contentType: a.mimeType,
        })),
      });
      await cmsRepository.markContactEmailSent(submissionId);
    } catch (err) {
      emailError = err instanceof Error ? err.message : 'Failed to send email';
      await cmsRepository.markContactEmailFailed(submissionId, emailError);
      recordAudit({
        actorId: null,
        action: 'CONTACT.EMAIL_FAILED',
        entityType: 'contact_submission',
        entityId: submissionId,
        afterState: { email: parsed.email, error: emailError },
        ipAddress: meta.ip,
      });
      throw Object.assign(new Error('Failed to send your message. Please try again later.'), {
        statusCode: 502,
        errorCode: 'CONTACT_EMAIL_FAILED',
      });
    }

    recordAudit({
      actorId: null,
      action: 'CONTACT.SUBMIT',
      entityType: 'contact_submission',
      entityId: submissionId,
      afterState: {
        email: parsed.email,
        subject: displaySubject,
        attachmentCount: uploadedAttachments.length,
      },
      ipAddress: meta.ip,
    });

    return { id: submissionId, supportEmail };
  },
};
