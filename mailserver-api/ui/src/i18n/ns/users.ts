import type { NamespaceModule } from '../types';

const users: NamespaceModule = {
  en: {
    title: 'Admin users',
    colEmail: 'Email',
    colRole: 'Role',
    colDomains: 'Domains',
    colLastLogin: 'Last login',
    colCreated: 'Created',
    fieldEmail: 'Email',
    fieldPassword: 'Password (min 8 chars)',
    changePassword: 'Change password',
    newPasswordPrompt: 'New password (min 8 chars):',
    passwordTooShort: 'Password must be at least 8 characters',
    failedChangePassword: 'Failed to change password',
    passwordUpdated: '✓ updated',
  },
  ru: {
    title: 'Администраторы',
    colEmail: 'Email',
    colRole: 'Роль',
    colDomains: 'Домены',
    colLastLogin: 'Последний вход',
    colCreated: 'Создано',
    fieldEmail: 'Email',
    fieldPassword: 'Пароль (мин. 8 символов)',
    changePassword: 'Сменить пароль',
    newPasswordPrompt: 'Новый пароль (мин. 8 символов):',
    passwordTooShort: 'Пароль должен содержать не менее 8 символов',
    failedChangePassword: 'Ошибка смены пароля',
    passwordUpdated: '✓ обновлён',
  },
};

export default users;
