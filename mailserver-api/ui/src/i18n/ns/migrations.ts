import type { NamespaceModule } from '../types';

const migrations: NamespaceModule = {
  en: {
    title: 'IMAP migration',
    description:
      'One-shot import of an external mailbox into a local address via Dovecot dsync. Re-running a job is safe (idempotent). The source password is stored encrypted and wiped once the job finishes.',
    newMigration: 'New migration',
    sourceHost: 'Source IMAP host',
    ssl: 'SSL',
    port: 'Port',
    sourceUsername: 'Source username',
    sourcePassword: 'Source password',
    destMailbox: 'Destination mailbox',
    selectOption: 'Select…',
    queuing: 'Queuing…',
    startMigration: 'Start migration',
    migrationQueued: 'Migration queued',
    noMigrations: 'No migrations yet.',
    colSource: 'Source',
    colDestination: 'Destination',
    colStatus: 'Status',
    colCreated: 'Created',
    log: 'Log',
    hideLog: 'Hide log',
    noLog: 'No log output.',
  },
  ru: {
    title: 'Миграция IMAP',
    description:
      'Единовременный импорт внешнего ящика на локальный адрес через Dovecot dsync. Повторный запуск безопасен (идемпотентен). Пароль источника хранится в зашифрованном виде и удаляется после завершения задачи.',
    newMigration: 'Новая миграция',
    sourceHost: 'Сервер IMAP источника',
    ssl: 'SSL',
    port: 'Порт',
    sourceUsername: 'Логин источника',
    sourcePassword: 'Пароль источника',
    destMailbox: 'Целевой ящик',
    selectOption: 'Выбрать…',
    queuing: 'Постановка в очередь…',
    startMigration: 'Начать миграцию',
    migrationQueued: 'Миграция поставлена в очередь',
    noMigrations: 'Нет миграций.',
    colSource: 'Источник',
    colDestination: 'Назначение',
    colStatus: 'Статус',
    colCreated: 'Создано',
    log: 'Лог',
    hideLog: 'Скрыть лог',
    noLog: 'Нет вывода лога.',
  },
};

export default migrations;
