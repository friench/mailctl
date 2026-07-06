import type { NamespaceModule } from '../types';

const importPage: NamespaceModule = {
  en: {
    title: 'Bulk import',
    description:
      'Idempotent provisioning from a JSON document. Domains are created first, then mailboxes, then aliases; anything that already exists is skipped, so re-running is safe. Use a dry run to preview.',
    dryRun: 'Dry run',
    import: 'Import',
    working: 'Working…',
    dryRunBadge: 'dry run',
    applied: 'applied',
    toCreate: 'to create',
    createdWord: 'created',
    skippedWord: 'skipped',
    failedWord: 'failed',
    domainsTitle: 'Domains',
    mailboxesTitle: 'Mailboxes',
    aliasesTitle: 'Aliases',
  },
  ru: {
    title: 'Массовый импорт',
    description:
      'Идемпотентная инициализация из JSON-документа. Сначала создаются домены, затем почтовые ящики, затем алиасы; уже существующие записи пропускаются, поэтому повторный запуск безопасен. Используйте пробный запуск для предварительного просмотра.',
    dryRun: 'Пробный запуск',
    import: 'Импортировать',
    working: 'Выполняется…',
    dryRunBadge: 'пробный запуск',
    applied: 'применено',
    toCreate: 'будет создано',
    createdWord: 'создано',
    skippedWord: 'пропущено',
    failedWord: 'ошибок',
    domainsTitle: 'Домены',
    mailboxesTitle: 'Ящики',
    aliasesTitle: 'Алиасы',
  },
};

export default importPage;
