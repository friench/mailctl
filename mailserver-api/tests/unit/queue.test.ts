import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { SendJobService, computeBackoffMs } from '../../src/domain/queue/service';
import { PermanentSendError } from '../../src/domain/send/types';
import { createLogger } from '../../src/logger';
import type { MailSender } from '../../src/domain/send/mailer';

const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

interface MailerStub {
  send: ReturnType<typeof vi.fn>;
}

function makeMailer(): MailerStub {
  return { send: vi.fn() };
}

function makeService(h: TestDbHandle, mailer: MailerStub): SendJobService {
  return new SendJobService(h.sendJobRepo, mailer as unknown as MailSender, logger);
}

const samplePayload = { to: 'a@b.co', subject: 's', html: 'h' };

describe('computeBackoffMs', () => {
  it('returns base delay for first failure', () => {
    expect(computeBackoffMs(1)).toBe(30_000);
  });

  it('doubles each attempt', () => {
    expect(computeBackoffMs(2)).toBe(60_000);
    expect(computeBackoffMs(3)).toBe(120_000);
    expect(computeBackoffMs(4)).toBe(240_000);
  });
});

describe('SendJobService.enqueue', () => {
  let h: TestDbHandle;
  beforeEach(() => (h = createTestDb()));
  afterEach(() => h.close());

  it('creates a pending row with attempts=0', () => {
    const service = makeService(h, makeMailer());
    const job = service.enqueue({ payload: samplePayload });

    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(3);
    expect(job.payload).toEqual(samplePayload);
  });

  it('persists apiKeyId reference', () => {
    const service = makeService(h, makeMailer());
    const created = h.apiKeyService.generateAndStore('caller');
    const job = service.enqueue({ payload: samplePayload, apiKeyId: created.id });

    const stored = h.sendJobRepo.findById(job.id);
    expect(stored?.apiKeyId).toBe(created.id);
  });
});

describe('SendJobService.processOne', () => {
  let h: TestDbHandle;
  beforeEach(() => (h = createTestDb()));
  afterEach(() => h.close());

  it('returns false when nothing is queued', async () => {
    const service = makeService(h, makeMailer());
    expect(await service.processOne()).toBe(false);
  });

  it('claims and marks done on successful send', async () => {
    const mailer = makeMailer();
    mailer.send.mockResolvedValue({ messageId: '<id-1>', account: 'primary' });
    const service = makeService(h, mailer);

    const job = service.enqueue({ payload: samplePayload });
    expect(await service.processOne()).toBe(true);

    const after = h.sendJobRepo.findById(job.id);
    expect(after?.status).toBe('done');
    expect(after?.attempts).toBe(1);
    expect(after?.accountUsed).toBe('primary');
    expect(after?.messageId).toBe('<id-1>');
    expect(after?.completedAt).toBeInstanceOf(Date);
  });

  it('reschedules to pending on transient failure', async () => {
    const mailer = makeMailer();
    mailer.send.mockRejectedValue(new Error('All SMTP accounts failed'));
    const service = makeService(h, mailer);

    const job = service.enqueue({ payload: samplePayload, maxAttempts: 3 });
    await service.processOne();

    const after = h.sendJobRepo.findById(job.id);
    expect(after?.status).toBe('pending');
    expect(after?.attempts).toBe(1);
    expect(after?.lastError).toMatch(/All SMTP accounts failed/);
    expect(after?.nextAttemptAt.getTime()).toBeGreaterThan(job.createdAt.getTime());
  });

  it('dead-letters immediately on a permanent error, ignoring remaining attempts', async () => {
    const mailer = makeMailer();
    mailer.send.mockRejectedValue(new PermanentSendError(new Error('550 mailbox unavailable')));
    const service = makeService(h, mailer);

    const job = service.enqueue({ payload: samplePayload, maxAttempts: 3 });
    await service.processOne();

    const after = h.sendJobRepo.findById(job.id);
    expect(after?.status).toBe('dead');
    expect(after?.attempts).toBe(1); // not retried up to maxAttempts
    expect(after?.lastError).toMatch(/mailbox unavailable/);
  });

  it('marks dead after max attempts', async () => {
    const mailer = makeMailer();
    mailer.send.mockRejectedValue(new Error('boom'));
    const service = makeService(h, mailer);

    const job = service.enqueue({ payload: samplePayload, maxAttempts: 1 });
    await service.processOne();

    const after = h.sendJobRepo.findById(job.id);
    expect(after?.status).toBe('dead');
    expect(after?.attempts).toBe(1);
    expect(after?.lastError).toBe('boom');
    expect(after?.completedAt).toBeInstanceOf(Date);
  });

  it('skips pending jobs scheduled for the future', async () => {
    const mailer = makeMailer();
    mailer.send.mockResolvedValue({ messageId: '<id>', account: 'a' });
    const service = makeService(h, mailer);

    const future = new Date(Date.now() + 60_000);
    h.sendJobRepo.create({ payload: samplePayload, nextAttemptAt: future });

    expect(await service.processOne()).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('claims oldest ready job first', async () => {
    const mailer = makeMailer();
    mailer.send.mockResolvedValue({ messageId: '<id>', account: 'a' });
    const service = makeService(h, mailer);

    const earlier = new Date(Date.now() - 10_000);
    const later = new Date(Date.now() - 5_000);
    const j1 = h.sendJobRepo.create({ payload: samplePayload, nextAttemptAt: earlier });
    h.sendJobRepo.create({ payload: samplePayload, nextAttemptAt: later });

    await service.processOne();

    expect(h.sendJobRepo.findById(j1.id)?.status).toBe('done');
  });
});

describe('SendJobService.processSpecific', () => {
  let h: TestDbHandle;
  beforeEach(() => (h = createTestDb()));
  afterEach(() => h.close());

  it('processes the named pending job', async () => {
    const mailer = makeMailer();
    mailer.send.mockResolvedValue({ messageId: '<id>', account: 'p' });
    const service = makeService(h, mailer);

    const job = service.enqueue({ payload: samplePayload });
    const result = await service.processSpecific(job.id);

    expect(result.status).toBe('done');
    expect(result.messageId).toBe('<id>');
  });

  it('returns existing row without processing if not pending', async () => {
    const mailer = makeMailer();
    const service = makeService(h, mailer);
    const job = service.enqueue({ payload: samplePayload });
    h.sendJobRepo.markDone(job.id, { account: 'x', messageId: '<m>' });

    const result = await service.processSpecific(job.id);
    expect(result.status).toBe('done');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('throws 404 for unknown id', async () => {
    const service = makeService(h, makeMailer());
    await expect(service.processSpecific('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      /Job not found/,
    );
  });
});

describe('SendJobService.recoverStuckJobs', () => {
  let h: TestDbHandle;
  beforeEach(() => (h = createTestDb()));
  afterEach(() => h.close());

  it('resets processing rows back to pending', () => {
    const service = makeService(h, makeMailer());
    const job = service.enqueue({ payload: samplePayload });
    // Simulate crash: row left in 'processing'
    h.client.sqlite.prepare("UPDATE send_jobs SET status = 'processing' WHERE id = ?").run(job.id);

    const count = service.recoverStuckJobs();
    expect(count).toBe(1);
    expect(h.sendJobRepo.findById(job.id)?.status).toBe('pending');
  });

  it('returns 0 when nothing is stuck', () => {
    const service = makeService(h, makeMailer());
    expect(service.recoverStuckJobs()).toBe(0);
  });
});
