import { BusinessError } from '../../lib/errors';
import type { MailSender } from '../send/mailer';
import type { SmtpAccountRow } from '../../db/schema';
import type { SmtpAccountLoader } from './loader';
import type {
  CreateSmtpAccountInput,
  SmtpAccountRepository,
  UpdateSmtpAccountInput,
} from './repository';

export class SmtpAccountService {
  constructor(
    private readonly repo: SmtpAccountRepository,
    private readonly loader: SmtpAccountLoader,
    private readonly mailer: MailSender,
  ) {}

  list(): SmtpAccountRow[] {
    return this.repo.list();
  }

  findById(id: string): SmtpAccountRow | undefined {
    return this.repo.findById(id);
  }

  create(input: CreateSmtpAccountInput): SmtpAccountRow {
    const row = this.repo.create(input);
    this.reload();
    return row;
  }

  update(id: string, input: UpdateSmtpAccountInput): SmtpAccountRow {
    const row = this.repo.update(id, input);
    if (!row) throw new BusinessError(404, 'SMTP account not found');
    this.reload();
    return row;
  }

  delete(id: string): void {
    const ok = this.repo.delete(id);
    if (!ok) throw new BusinessError(404, 'SMTP account not found');
    this.reload();
  }

  private reload(): void {
    this.mailer.reload(this.loader.loadActive());
  }
}
