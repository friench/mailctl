import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('nodemailer');

import * as nodemailer from 'nodemailer';
import { MailSender } from '../../src/domain/send/mailer';
import { createLogger } from '../../src/logger';
import type { ResolvedSmtpAccount } from '../../src/domain/smtp-accounts/loader';

const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

interface MockTransport {
  sendMail: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function resolved(name: string, overrides: Partial<ResolvedSmtpAccount> = {}): ResolvedSmtpAccount {
  return {
    id: name,
    name,
    host: `${name}.example.com`,
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromAddress: `${name}@example.com`,
    fromName: null,
    from: `${name}@example.com`,
    priority: 1,
    requireTls: false,
    rejectUnauthorized: null,
    minTlsVersion: null,
    ...overrides,
  };
}

describe('MailSender', () => {
  let transports: Map<string, MockTransport>;

  beforeEach(() => {
    transports = new Map();
    vi.mocked(nodemailer.createTransport).mockImplementation((opts: unknown) => {
      const o = opts as { host: string; port: number };
      const key = `${o.host}:${o.port}`;
      if (!transports.has(key)) {
        transports.set(key, { sendMail: vi.fn(), close: vi.fn() });
      }
      return transports.get(key) as unknown as nodemailer.Transporter;
    });
  });

  it('initializes empty', () => {
    const m = new MailSender([], logger);
    expect(m.accountCount).toBe(0);
    expect(m.getDefaultFrom()).toBe('');
  });

  it('uses highest-priority account fromString as defaultFrom', () => {
    const a = resolved('a', { from: '"A" <a@example.com>' });
    const b = resolved('b');
    const m = new MailSender([a, b], logger);
    expect(m.getDefaultFrom()).toBe('"A" <a@example.com>');
  });

  it('validateFrom accepts known fromAddresses', () => {
    const m = new MailSender([resolved('a'), resolved('b')], logger);
    expect(m.validateFrom('a@example.com')).toBeNull();
    expect(m.validateFrom('"Whatever" <b@example.com>')).toBeNull();
    expect(m.validateFrom('c@example.com')).toMatch(/not allowed/);
  });

  it('throws when send called with no accounts', async () => {
    const m = new MailSender([], logger);
    await expect(m.send({ to: 'to@x.com', subject: 's', html: 'h' })).rejects.toThrow(
      /No active SMTP accounts/,
    );
  });

  it('uses first account on success', async () => {
    const m = new MailSender([resolved('a'), resolved('b')], logger);
    transports.get('a.example.com:587')!.sendMail.mockResolvedValue({ messageId: '<id-1>' });

    const result = await m.send({ to: 'to@x.com', subject: 's', html: 'h' });
    expect(result.account).toBe('a');
    expect(result.messageId).toBe('<id-1>');
    expect(transports.get('a.example.com:587')!.sendMail).toHaveBeenCalledTimes(1);
    expect(transports.get('b.example.com:587')!.sendMail).not.toHaveBeenCalled();
  });

  it('falls over to next account on permanent error', async () => {
    const m = new MailSender([resolved('a'), resolved('b')], logger);
    transports.get('a.example.com:587')!.sendMail.mockRejectedValue(new Error('permanent error'));
    transports.get('b.example.com:587')!.sendMail.mockResolvedValue({ messageId: '<id-2>' });

    const result = await m.send({ to: 'to@x.com', subject: 's', html: 'h' });
    expect(result.account).toBe('b');
    // Permanent error → 1 attempt on a, no retry within account.
    expect(transports.get('a.example.com:587')!.sendMail).toHaveBeenCalledTimes(1);
  });

  it('retries within account on transient error', async () => {
    const m = new MailSender([resolved('a')], logger);
    const t = transports.get('a.example.com:587')!;
    t.sendMail
      .mockRejectedValueOnce(new Error('connection timeout'))
      .mockResolvedValueOnce({ messageId: '<id>' });

    const result = await m.send({ to: 'to@x.com', subject: 's', html: 'h' });
    expect(result.account).toBe('a');
    expect(t.sendMail).toHaveBeenCalledTimes(2);
  });

  it('throws when all accounts fail', async () => {
    const m = new MailSender([resolved('a'), resolved('b')], logger);
    transports.get('a.example.com:587')!.sendMail.mockRejectedValue(new Error('permanent'));
    transports.get('b.example.com:587')!.sendMail.mockRejectedValue(new Error('permanent'));

    await expect(m.send({ to: 'to@x.com', subject: 's', html: 'h' })).rejects.toThrow(
      /All SMTP accounts failed/,
    );
  });

  it('uses provided from instead of defaultFrom', async () => {
    const m = new MailSender([resolved('a')], logger);
    transports.get('a.example.com:587')!.sendMail.mockResolvedValue({ messageId: '<id>' });

    await m.send({ to: 'to@x.com', subject: 's', html: 'h', from: '"Custom" <a@example.com>' });

    const call = transports.get('a.example.com:587')!.sendMail.mock.calls[0]![0];
    expect(call.from).toBe('"Custom" <a@example.com>');
  });

  it('passes text, replyTo and base64 attachments to sendMail', async () => {
    const m = new MailSender([resolved('a')], logger);
    transports.get('a.example.com:587')!.sendMail.mockResolvedValue({ messageId: '<id>' });

    await m.send({
      to: 'to@x.com',
      subject: 's',
      html: '<p>h</p>',
      text: 'h',
      replyTo: 'reply@example.com',
      attachments: [{ filename: 'cv.pdf', content: 'JVBERi0=', contentType: 'application/pdf' }],
    });

    const call = transports.get('a.example.com:587')!.sendMail.mock.calls[0]![0];
    expect(call.text).toBe('h');
    expect(call.replyTo).toBe('reply@example.com');
    expect(call.attachments).toEqual([
      {
        filename: 'cv.pdf',
        content: 'JVBERi0=',
        encoding: 'base64',
        contentType: 'application/pdf',
      },
    ]);
  });

  it('omits attachments when none provided', async () => {
    const m = new MailSender([resolved('a')], logger);
    transports.get('a.example.com:587')!.sendMail.mockResolvedValue({ messageId: '<id>' });

    await m.send({ to: 'to@x.com', subject: 's', html: 'h' });

    const call = transports.get('a.example.com:587')!.sendMail.mock.calls[0]![0];
    expect(call.attachments).toBeUndefined();
    expect(call.text).toBeUndefined();
    expect(call.replyTo).toBeUndefined();
  });

  it('creates transporters with tls.rejectUnauthorized true by default', () => {
    new MailSender([resolved('a')], logger);
    const opts = vi.mocked(nodemailer.createTransport).mock.calls[0]![0] as {
      tls?: { rejectUnauthorized?: boolean };
    };
    expect(opts.tls?.rejectUnauthorized).toBe(true);
  });

  it('honors tlsRejectUnauthorized=false option', () => {
    new MailSender([resolved('a')], logger, { tlsRejectUnauthorized: false });
    const opts = vi.mocked(nodemailer.createTransport).mock.calls[0]![0] as {
      tls?: { rejectUnauthorized?: boolean };
    };
    expect(opts.tls?.rejectUnauthorized).toBe(false);
  });

  it('reload replaces accounts and closes old transporters', () => {
    const m = new MailSender([resolved('a')], logger);
    expect(m.accountCount).toBe(1);
    const oldTransport = transports.get('a.example.com:587')!;

    m.reload([resolved('a'), resolved('b')]);
    expect(m.accountCount).toBe(2);
    expect(oldTransport.close).toHaveBeenCalled();
  });
});
