import type { NamespaceModule } from '../types';

const webhooks: NamespaceModule = {
  en: {
    title: 'Webhooks',
    colName: 'Name',
    colUrl: 'URL',
    colEvents: 'Events',
    colActive: 'Active',
    fieldName: 'Name',
    fieldUrl: 'URL',
    fieldEvents: 'Events (comma-separated; choose from: {events})',
    saveSecretNow: 'Save this signing secret now — it will not be shown again.',
    secretUsage:
      'Use it to verify HMAC-SHA256 signatures on incoming webhooks (header: X-Webhook-Signature).',
    test: 'Test',
    pinging: 'Pinging…',
    disable: 'Disable',
    enable: 'Enable',
    editUrl: 'Edit URL',
    promptWebhookUrl: 'Webhook URL',
    saved: 'Saved',
    updateFailed: 'Update failed',
    deliveryColEvent: 'Event',
    deliveryColStatus: 'Status',
    deliveryColResponse: 'Response',
  },
  ru: {
    title: 'Вебхуки',
    colName: 'Имя',
    colUrl: 'URL',
    colEvents: 'События',
    colActive: 'Активен',
    fieldName: 'Имя',
    fieldUrl: 'URL',
    fieldEvents: 'События (через запятую; выберите из: {events})',
    saveSecretNow: 'Сохраните секрет подписи сейчас — он больше не будет показан.',
    secretUsage:
      'Используйте его для проверки HMAC-SHA256 подписей входящих вебхуков (заголовок: X-Webhook-Signature).',
    test: 'Тест',
    pinging: 'Отправка…',
    disable: 'Отключить',
    enable: 'Включить',
    editUrl: 'Изменить URL',
    promptWebhookUrl: 'URL вебхука',
    saved: 'Сохранено',
    updateFailed: 'Ошибка обновления',
    deliveryColEvent: 'Событие',
    deliveryColStatus: 'Статус',
    deliveryColResponse: 'Ответ',
  },
};

export default webhooks;
