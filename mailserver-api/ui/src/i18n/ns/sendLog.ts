import type { NamespaceModule } from '../types';

const sendLog: NamespaceModule = {
  en: {
    title: 'Send log',
    filterAll: 'All',
    filterPending: 'Pending / processing',
    filterDone: 'Done',
    filterDead: 'Dead',
    colTo: 'To',
    colSubject: 'Subject',
    colStatus: 'Status',
    colAttempts: 'Attempts',
    colAccount: 'Account',
    noJobs: 'No jobs.',
  },
  ru: {
    title: 'Журнал отправки',
    filterAll: 'Все',
    filterPending: 'Ожидание / обработка',
    filterDone: 'Выполнено',
    filterDead: 'Мертвые',
    colTo: 'Кому',
    colSubject: 'Тема',
    colStatus: 'Статус',
    colAttempts: 'Попытки',
    colAccount: 'Аккаунт',
    noJobs: 'Нет задач.',
  },
};

export default sendLog;
