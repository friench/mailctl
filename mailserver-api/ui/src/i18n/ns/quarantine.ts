import type { NamespaceModule } from '../types';

const quarantine: NamespaceModule = {
  en: {
    title: 'Spam quarantine',
    mailbox: 'Mailbox',
    allWithSpam: 'All (with spam)',
    description:
      "Spam filed into each mailbox's Junk folder. Release moves a message back to the inbox; delete expunges it permanently.",
    released: 'Released',
    deleted: 'Deleted',
    noSpam: 'No quarantined spam.',
    messageSingular: 'message',
    messagePlural: 'messages',
  },
  ru: {
    title: 'Спам-карантин',
    mailbox: 'Ящик',
    allWithSpam: 'Все (со спамом)',
    description:
      'Спам, помещённый в папку «Нежелательная почта» каждого ящика. «Доставить» перемещает письмо во «Входящие»; «Удалить» безвозвратно удаляет его.',
    released: 'Доставлено',
    deleted: 'Удалено',
    noSpam: 'Нет писем на карантине.',
    messageSingular: 'письмо',
    messagePlural: 'писем',
  },
};

export default quarantine;
