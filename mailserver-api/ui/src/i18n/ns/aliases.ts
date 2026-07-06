import type { NamespaceModule } from '../types';

const aliases: NamespaceModule = {
  en: {
    title: 'Aliases',
    tempTitle: 'Generate temp address',
    tempDomain: 'Domain',
    tempForwardTo: 'Forward to',
    tempTtl: 'TTL hours (optional)',
    tempGenerating: 'Generating…',
    tempGenerate: 'Generate',
    colAlias: 'Alias',
    colTarget: 'Target',
    colSource: 'Source',
    colNotes: 'Notes',
    colExpires: 'Expires',
    colCreated: 'Created',
    fieldAddress: 'Alias address (use @domain for a catch-all)',
    fieldTarget: 'Target(s) — email, @domain, or devnull to discard',
    fieldNotes: 'Notes (optional)',
  },
  ru: {
    title: 'Алиасы',
    tempTitle: 'Создать временный адрес',
    tempDomain: 'Домен',
    tempForwardTo: 'Переслать на',
    tempTtl: 'Срок действия в часах (необязательно)',
    tempGenerating: 'Создание…',
    tempGenerate: 'Создать',
    colAlias: 'Алиас',
    colTarget: 'Цель',
    colSource: 'Источник',
    colNotes: 'Примечания',
    colExpires: 'Истекает',
    colCreated: 'Создан',
    fieldAddress: 'Адрес алиаса (для перехвата всей почты используйте @domain)',
    fieldTarget: 'Цель: email, @domain или devnull для удаления',
    fieldNotes: 'Примечания (необязательно)',
  },
};

export default aliases;
