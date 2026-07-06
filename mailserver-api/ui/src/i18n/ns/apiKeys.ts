import type { NamespaceModule } from '../types';

const apiKeys: NamespaceModule = {
  en: {
    title: 'API keys',
    colName: 'Name',
    colPrefix: 'Prefix',
    colScopes: 'Scopes',
    colLastUsed: 'Last used',
    colRevoked: 'Revoked',
    colExpires: 'Expires',
    fieldName: 'Name',
    fieldScopes: 'Scopes (comma-separated, e.g. "send" or "admin")',
    fieldExpiresInDays: 'Expires in days (optional)',
    saveKeyNow: 'Save this key now — it will not be shown again.',
  },
  ru: {
    title: 'API-ключи',
    colName: 'Имя',
    colPrefix: 'Префикс',
    colScopes: 'Права доступа',
    colLastUsed: 'Последнее использование',
    colRevoked: 'Отозван',
    colExpires: 'Истекает',
    fieldName: 'Имя',
    fieldScopes: 'Права доступа (через запятую, например "send" или "admin")',
    fieldExpiresInDays: 'Срок действия в днях (необязательно)',
    saveKeyNow: 'Сохраните ключ сейчас — он больше не будет показан.',
  },
};

export default apiKeys;
