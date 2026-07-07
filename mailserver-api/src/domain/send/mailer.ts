import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Logger } from '../../logger';
import type { ResolvedSmtpAccount } from '../smtp-accounts/loader';
import { PermanentSendError, type SendResult } from './types';

const TRANSIENT_ERROR_PATTERNS = ['timeout', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];

type SmtpError = Error & { code?: string; responseCode?: number };

function isTransientError(err: SmtpError): boolean {
  if (err.code === 'ESOCKET') return true;
  return TRANSIENT_ERROR_PATTERNS.some((p) => err.message?.includes(p));
}

/**
 * A 5xx SMTP reply is permanent (bad recipient, policy reject, message too big):
 * neither retrying nor failing over to another relay will fix it. 4xx replies
 * (greylisting, temp local error) stay transient and keep the retry/failover path.
 */
function isPermanentError(err: SmtpError): boolean {
  return typeof err.responseCode === 'number' && err.responseCode >= 500 && err.responseCode < 600;
}

/**
 * Build the nodemailer transport options for an account, applying its per-account
 * TLS policy over the global cert-verification default. Pure + exported so the
 * policy mapping is unit-testable without touching nodemailer.
 */
export function buildTransportOptions(
  account: ResolvedSmtpAccount,
  globalRejectUnauthorized: boolean,
): nodemailer.TransportOptions & Record<string, unknown> {
  const tls: Record<string, unknown> = {
    // Per-account override wins; null inherits the global default.
    rejectUnauthorized: account.rejectUnauthorized ?? globalRejectUnauthorized,
  };
  if (account.minTlsVersion) tls.minVersion = account.minTlsVersion;

  const opts: nodemailer.TransportOptions & Record<string, unknown> = {
    host: account.host,
    port: account.port,
    secure: account.secure,
    // Force STARTTLS when required (ignored for implicit-TLS `secure` accounts).
    requireTLS: account.requireTls,
    tls,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };

  if (account.user) {
    opts.auth = { user: account.user, pass: account.password };
  }
  return opts;
}

function createTransporter(
  account: ResolvedSmtpAccount,
  tlsRejectUnauthorized: boolean,
): Transporter {
  return nodemailer.createTransport(buildTransportOptions(account, tlsRejectUnauthorized));
}

interface MailSenderAccount extends ResolvedSmtpAccount {
  transporter: Transporter;
}

export interface MailSenderOptions {
  /** Verify TLS certificates of outbound SMTP relays. Defaults to true. */
  tlsRejectUnauthorized?: boolean;
}

export class MailSender {
  private accounts: MailSenderAccount[] = [];
  private allowedFromAddresses: Set<string> = new Set();
  private defaultFrom: string = '';
  private readonly logger: Logger;
  private readonly tlsRejectUnauthorized: boolean;

  constructor(
    initialAccounts: ResolvedSmtpAccount[],
    logger: Logger,
    options: MailSenderOptions = {},
  ) {
    this.logger = logger;
    this.tlsRejectUnauthorized = options.tlsRejectUnauthorized ?? true;
    this.setAccounts(initialAccounts);
  }

  /** Replace the in-memory account set; called on init and when admin updates accounts. */
  reload(accounts: ResolvedSmtpAccount[]): void {
    for (const a of this.accounts) {
      try {
        a.transporter.close();
      } catch {
        // ignore close errors
      }
    }
    this.setAccounts(accounts);
  }

  private setAccounts(accounts: ResolvedSmtpAccount[]): void {
    this.accounts = accounts.map((a) => ({
      ...a,
      transporter: createTransporter(a, this.tlsRejectUnauthorized),
    }));
    this.allowedFromAddresses = new Set(accounts.map((a) => a.fromAddress.toLowerCase()));
    this.defaultFrom = accounts[0]?.from ?? '';

    this.logger.info(
      {
        count: this.accounts.length,
        accounts: this.accounts.map((a) => ({ name: a.name, priority: a.priority })),
        defaultFrom: this.defaultFrom,
      },
      'MailSender (re)loaded',
    );
  }

  get accountCount(): number {
    return this.accounts.length;
  }

  getDefaultFrom(): string {
    return this.defaultFrom;
  }

  private extractEmail(from: string): string {
    const match = from.match(/<([^>]+)>/);
    const captured = match?.[1];
    return (captured ?? from).trim().toLowerCase();
  }

  validateFrom(from: string): string | null {
    const address = this.extractEmail(from);
    if (!this.allowedFromAddresses.has(address)) {
      return `From address "${address}" is not allowed`;
    }
    return null;
  }

  private recreateTransporter(account: MailSenderAccount): void {
    try {
      account.transporter.close();
    } catch {
      // ignore
    }
    account.transporter = createTransporter(account, this.tlsRejectUnauthorized);
  }

  async send(input: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    text?: string;
    replyTo?: string;
    attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  }): Promise<SendResult> {
    if (this.accounts.length === 0) {
      throw new Error('No active SMTP accounts configured');
    }

    const { to, subject, html, from, text, replyTo, attachments } = input;
    const senderFrom = from ?? this.defaultFrom;
    const maxRetries = 2;

    const mailAttachments = attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      encoding: 'base64' as const,
      contentType: a.contentType,
    }));

    let lastError: SmtpError | undefined;

    for (const account of this.accounts) {
      for (let retry = 1; retry <= maxRetries; retry++) {
        try {
          const info = await account.transporter.sendMail({
            from: senderFrom,
            to,
            subject,
            html,
            text,
            replyTo,
            attachments: mailAttachments,
          });

          this.logger.info({ account: account.name, to, messageId: info.messageId }, 'Mail sent');
          return { messageId: info.messageId, account: account.name };
        } catch (err) {
          const error = err as SmtpError;
          lastError = error;
          this.logger.warn(
            {
              account: account.name,
              retry,
              max: maxRetries,
              responseCode: error.responseCode,
              error: error.message,
            },
            'SMTP send attempt failed',
          );

          // A 5xx is permanent: don't retry this account, don't fail over, don't
          // let the queue reschedule — surface it so the job is dead-lettered now.
          if (isPermanentError(error)) {
            throw new PermanentSendError(error);
          }
          if (isTransientError(error) && retry < maxRetries) {
            this.recreateTransporter(account);
            continue;
          }
          break;
        }
      }
    }

    // All accounts exhausted with transient failures — preserve the last cause.
    throw new Error(
      `All SMTP accounts failed; last: ${lastError?.message ?? 'unknown error'}`,
      lastError ? { cause: lastError } : undefined,
    );
  }
}
