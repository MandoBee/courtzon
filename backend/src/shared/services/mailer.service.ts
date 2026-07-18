import { createModuleLogger } from '../utils/logger.js';

export interface EmailAttachment {
  filename: string;
  path: string;
  contentType?: string;
}

export interface SendEmailJob {
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
}

const log = createModuleLogger('mailer');

export async function sendEmail(job: SendEmailJob): Promise<void> {
  log.info({ to: job.to, subject: job.subject }, `Sending email: ${job.subject}`);

  const transport = process.env.MAIL_TRANSPORT || 'log';

  switch (transport) {
    case 'smtp': {
      const { default: nodemailer } = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST || 'localhost',
        port: Number(process.env.MAIL_PORT) || 587,
        auth: {
          user: process.env.MAIL_USER || '',
          pass: process.env.MAIL_PASS || '',
        },
      });
      await transporter.sendMail({
        from: process.env.MAIL_FROM || 'noreply@courtzon.com',
        to: job.to,
        subject: job.subject,
        text: job.body,
        html: job.html || job.body,
        attachments: job.attachments?.map((a) => ({
          filename: a.filename,
          path: a.path,
          contentType: a.contentType,
        })),
      });
      break;
    }
    default:
      log.info(
        {
          to: job.to,
          subject: job.subject,
          body: job.body,
          attachmentCount: job.attachments?.length ?? 0,
        },
        `[LOG MAILER]`,
      );
  }
}
