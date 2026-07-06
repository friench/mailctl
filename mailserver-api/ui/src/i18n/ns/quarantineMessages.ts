import type { NamespaceModule } from '../types';

const quarantineMessages: NamespaceModule = {
  en: {
    noMessages: 'No quarantined messages.',
    selected: 'selected',
    releaseSelected: 'Release selected',
    deleteSelected: 'Delete selected',
    colFrom: 'From',
    colSubject: 'Subject',
    colDate: 'Date',
    colScore: 'Score',
    colSize: 'Size',
    noSubject: '(no subject)',
    view: 'View',
    release: 'Release',
  },
  ru: {
    noMessages: 'Нет писем на карантине.',
    selected: 'выбрано',
    releaseSelected: 'Доставить выбранные',
    deleteSelected: 'Удалить выбранные',
    colFrom: 'От',
    colSubject: 'Тема',
    colDate: 'Дата',
    colScore: 'Оценка',
    colSize: 'Размер',
    noSubject: '(без темы)',
    view: 'Открыть',
    release: 'Доставить',
  },
};

export default quarantineMessages;
