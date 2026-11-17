import { z } from 'zod';

/** What `GET /health` returns. Shared so the server and the web app agree on its shape. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
