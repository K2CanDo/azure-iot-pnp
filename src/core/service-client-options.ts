import { IdentityManager } from '@identity';
import { z } from 'zod';

export const ServiceClientOptionsSchema = z.object({
  connectionString: z.string(),
  identityManager: z.instanceof(IdentityManager).optional(),
});

export type ServiceClientOptions = z.infer<typeof ServiceClientOptionsSchema>;
