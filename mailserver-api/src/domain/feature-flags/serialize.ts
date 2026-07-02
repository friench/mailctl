import type { FeatureFlagDTO } from '../../contracts';
import type { FlagView } from './service';

export function serializeFlag(view: FlagView): FeatureFlagDTO {
  return {
    key: view.key,
    enabled: view.enabled,
    default: view.defaultValue,
    description: view.description,
    override: view.override,
    updatedAt: view.updatedAt?.toISOString() ?? null,
  };
}
