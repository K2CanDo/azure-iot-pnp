import { z } from 'zod';

export const TelemetrySchema = z.object({
  type: z.string(),
  payload: z.unknown().optional(),
  properties: z.record(z.string(), z.string()).optional(),
});

export type Telemetry = z.infer<typeof TelemetrySchema>
