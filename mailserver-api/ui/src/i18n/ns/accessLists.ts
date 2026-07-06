import type { NamespaceModule } from '../types';

const accessLists: NamespaceModule = {
  en: {
    title: 'Allow / deny lists',
    description:
      'Block or allow senders by email, domain, or client IP. Global rules are enforced via Postfix access maps and Rspamd; a recipient scopes a rule to one mailbox (enforced via Rspamd).',
    addRule: 'Add rule',
    action: 'Action',
    match: 'Match',
    value: 'Value',
    recipient: 'Recipient',
    note: 'Note',
    adding: 'Adding…',
    ruleAdded: 'Rule added',
    ruleRemoved: 'Rule removed',
    noRules: 'No rules yet.',
    colScope: 'Scope',
    global: 'global',
  },
  ru: {
    title: 'Белые/чёрные списки',
    description:
      'Блокировка или разрешение отправителей по адресу email, домену или IP-адресу клиента. Глобальные правила применяются через таблицы доступа Postfix и Rspamd; указание получателя ограничивает правило одним ящиком (через Rspamd).',
    addRule: 'Добавить правило',
    action: 'Действие',
    match: 'Тип',
    value: 'Значение',
    recipient: 'Получатель',
    note: 'Примечание',
    adding: 'Добавление…',
    ruleAdded: 'Правило добавлено',
    ruleRemoved: 'Правило удалено',
    noRules: 'Правил нет.',
    colScope: 'Область',
    global: 'глобально',
  },
};

export default accessLists;
