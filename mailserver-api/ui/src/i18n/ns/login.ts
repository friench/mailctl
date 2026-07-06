import type { NamespaceModule } from '../types';

const login: NamespaceModule = {
  en: {
    title: 'mailctl admin',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    or: 'or',
    ssoDefault: 'Sign in with SSO',
    loginFailed: 'Login failed',
  },
  ru: {
    title: 'mailctl админка',
    email: 'Email',
    password: 'Пароль',
    signIn: 'Войти',
    signingIn: 'Вход…',
    or: 'или',
    ssoDefault: 'Войти через SSO',
    loginFailed: 'Ошибка входа',
  },
};

export default login;
