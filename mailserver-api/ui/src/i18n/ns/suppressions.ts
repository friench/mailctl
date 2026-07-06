import type { NamespaceModule } from '../types';

const suppressions: NamespaceModule = {
  en: {
    title: 'Suppression list',
    intro:
      'Recipients that should not be delivered to. Sending to a suppressed address is blocked (422) unless the API key is suppression-exempt. Hard bounces are added automatically.',
    address: 'Address',
    reason: 'Reason',
    note: 'Note',
    source: 'Source',
    colDate: 'Added',
    addTitle: 'Suppress an address',
    addr_placeholder: 'user@example.com',
    empty: 'No suppressed addresses.',
    hard_bounce: 'hard bounce',
    complaint: 'complaint',
    manual: 'manual',
    unsubscribe: 'unsubscribe',
  },
  ru: {
    title: 'Список подавления',
    intro:
      'Получатели, которым не следует доставлять. Отправка на подавлённый адрес блокируется (422), если API-ключ не помечен как suppression-exempt. Жёсткие возвраты добавляются автоматически.',
    address: 'Адрес',
    reason: 'Причина',
    note: 'Заметка',
    source: 'Источник',
    colDate: 'Добавлен',
    addTitle: 'Подавить адрес',
    addr_placeholder: 'user@example.com',
    empty: 'Подавлённых адресов нет.',
    hard_bounce: 'жёсткий возврат',
    complaint: 'жалоба',
    manual: 'вручную',
    unsubscribe: 'отписка',
  },
};

export default suppressions;
