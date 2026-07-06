import type { NamespaceModule } from '../types';

const resourceTable: NamespaceModule = {
  en: {
    new: 'New',
    done: 'Done',
    failedToLoad: 'Failed to load:',
    noRecords: 'No records.',
    confirmDelete: 'Delete this record?',
    createFailed: 'Create failed',
    creating: 'Creating…',
  },
  ru: {
    new: 'Добавить',
    done: 'Готово',
    failedToLoad: 'Ошибка загрузки:',
    noRecords: 'Нет записей.',
    confirmDelete: 'Удалить эту запись?',
    createFailed: 'Ошибка создания',
    creating: 'Создание…',
  },
};

export default resourceTable;
