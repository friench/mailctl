import type { NamespaceModule } from '../types';

const featureFlags: NamespaceModule = {
  en: {
    title: 'Feature flags',
    colFlag: 'Flag',
    colState: 'State',
    colDefault: 'Default',
    colUpdated: 'Updated',
    enabled: 'enabled',
    disabled: 'disabled',
    override: 'override',
    resetToDefault: 'Reset to default',
  },
  ru: {
    title: 'Флаги функций',
    colFlag: 'Флаг',
    colState: 'Состояние',
    colDefault: 'По умолчанию',
    colUpdated: 'Обновлено',
    enabled: 'включён',
    disabled: 'отключён',
    override: 'переопределён',
    resetToDefault: 'Сбросить до умолчания',
  },
};

export default featureFlags;
