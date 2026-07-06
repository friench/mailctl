import type { NamespaceModule } from '../types';

const domains: NamespaceModule = {
  en: {
    title: 'Domains',
    disable: 'Disable',
    enable: 'Enable',
    colName: 'Name',
    dkimSelector: 'DKIM selector',
    colDkimKey: 'DKIM key',
    colActive: 'Active',
    colSource: 'Source',
    colNotes: 'Notes',
    colCreated: 'Created',
    dkimGenerated: '✓ generated',
    details: 'Details',
    fieldDomainName: 'Domain name',
    fieldNotes: 'Notes (optional)',
  },
  ru: {
    title: 'Домены',
    disable: 'Отключить',
    enable: 'Включить',
    colName: 'Название',
    dkimSelector: 'Селектор DKIM',
    colDkimKey: 'Ключ DKIM',
    colActive: 'Активен',
    colSource: 'Источник',
    colNotes: 'Примечания',
    colCreated: 'Создан',
    dkimGenerated: '✓ создан',
    details: 'Подробности',
    fieldDomainName: 'Имя домена',
    fieldNotes: 'Примечания (необязательно)',
  },
};

export default domains;
