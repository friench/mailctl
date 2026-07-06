import type { NamespaceModule } from '../types';

const bounces: NamespaceModule = {
  en: {
    title: 'Bounces',
    intro:
      'Delivery-status notifications (DSNs) captured from failed deliveries, correlated to the send job when possible. Route bounce mail to POST /admin/api/bounces/ingest to capture them.',
    colRecipient: 'Recipient',
    colClass: 'Type',
    colStatus: 'Status',
    colDiagnostic: 'Diagnostic',
    colJob: 'Send job',
    colDate: 'Date',
    hard: 'hard',
    soft: 'soft',
    unknown: 'unknown',
    empty: 'No bounces captured yet.',
  },
  ru: {
    title: 'Возвраты',
    intro:
      'Уведомления о недоставке (DSN), пойманные из неудачных доставок и связанные с задачей отправки, когда это возможно. Направьте bounce-почту на POST /admin/api/bounces/ingest для захвата.',
    colRecipient: 'Получатель',
    colClass: 'Тип',
    colStatus: 'Статус',
    colDiagnostic: 'Диагностика',
    colJob: 'Задача',
    colDate: 'Дата',
    hard: 'жёсткий',
    soft: 'мягкий',
    unknown: 'неизвестно',
    empty: 'Возвратов пока нет.',
  },
};

export default bounces;
