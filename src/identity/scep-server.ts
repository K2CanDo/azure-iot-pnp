import { z } from 'zod';

export const ScepResponseParserSchema = z.function()
  .args(z.string())
  .returns(z.string());

export type ScepResponseParser = z.infer<typeof ScepResponseParserSchema>

export const ScepServerSchema = z.object({
  otpUrl: z.string(),
  certUrl: z.string(),
  username: z.string(),
  password: z.string(),
  responseParser: ScepResponseParserSchema.optional(),
});

export type ScepServer = z.infer<typeof ScepServerSchema>;
