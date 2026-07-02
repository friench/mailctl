import { z } from 'zod';

export const setFlagSchema = z.object({
  enabled: z.boolean(),
});

export type SetFlagBody = z.infer<typeof setFlagSchema>;
