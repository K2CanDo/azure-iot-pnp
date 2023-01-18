import { z } from 'zod';

export const BlobUploadStatusSchema = z.object({
  success: z.boolean(),
  statusCode: z.number(),
  description: z.string(),
});

export type BlobUploadStatus = z.infer<typeof BlobUploadStatusSchema>;
