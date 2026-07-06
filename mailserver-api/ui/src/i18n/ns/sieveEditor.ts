import type { NamespaceModule } from '../types';

const sieveEditor: NamespaceModule = {
  en: {
    vacation: 'Vacation / out-of-office auto-reply',
    subjectPlaceholder: 'Subject',
    messagePlaceholder: 'Message',
    repeatInterval: 'Repeat interval (days)',
    filterRules: 'Filter rules',
    addRule: '+ Add rule',
    noRules: 'No rules.',
    ifWord: 'If',
    containsWord: 'contains',
    containsPlaceholder: 'text',
    folderPlaceholder: 'folder',
    addressPlaceholder: 'address',
    remove: 'remove',
    saveFilters: 'Save filters',
    saved: 'Saved',
  },
  ru: {
    vacation: 'Автоответ об отпуске / отсутствии',
    subjectPlaceholder: 'Тема',
    messagePlaceholder: 'Текст сообщения',
    repeatInterval: 'Интервал повтора (дней)',
    filterRules: 'Правила фильтрации',
    addRule: '+ Добавить правило',
    noRules: 'Правил нет.',
    ifWord: 'Если',
    containsWord: 'содержит',
    containsPlaceholder: 'текст',
    folderPlaceholder: 'папка',
    addressPlaceholder: 'адрес',
    remove: 'удалить',
    saveFilters: 'Сохранить фильтры',
    saved: 'Сохранено',
  },
};

export default sieveEditor;
