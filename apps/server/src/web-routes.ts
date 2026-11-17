import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { type Action, ActionBody, type AppVersions, BackupStatus, type WebState } from '@inventory/shared';
import { z } from 'zod';
import type { Db } from './db/client.ts';
import { devices } from './db/schema.ts';
import { applyActions, snapshot } from './sync/routes.ts';

/**
 * The web dashboard's API (spec §10.1). Like the rest of the server it is open on the home LAN.
 * The dashboard reads the whole state and records Actions as its own Device, "Dashboard", so its
 * changes show in history and can be undone like a phone's.
 */

/** The dashboard's Device. Its key is never used, so it can't push as a phone. */
export const DASHBOARD_DEVICE_ID = '00000000-0000-4000-8000-00000000da5b';

const WebActionsRequest = z.object({ actions: z.array(z.unknown()).min(1).max(200) });

export interface WebRoutesOptions {
  db: Db;
  appVersions: () => AppVersions;
  /** This server's version, for the footer. */
  serverVersion: string;
  /** The JSON file the nightly backup writes its result to (spec §11). */
  backupStatusFile?: string;
}

function readBackupStatus(file: string | undefined): BackupStatus | null {
  if (!file) return null;
  try {
    const parsed = BackupStatus.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function registerWebRoutes(app: FastifyInstance, { db, appVersions, serverVersion, backupStatusFile }: WebRoutesOptions): void {
  let dashboardReady: Promise<void> | null = null;
  const ensureDashboard = () =>
    (dashboardReady ??= db
      .insert(devices)
      .values({ id: DASHBOARD_DEVICE_ID, name: 'Dashboard', keyHash: `dashboard-${randomUUID()}` })
      .onConflictDoNothing()
      .then(() => undefined));

  app.get('/web/state', async (): Promise<WebState> => {
    await ensureDashboard();
    const snap = await snapshot(db, 0);
    return {
      ...(snap as unknown as Pick<WebState, 'seq' | 'changes'>),
      app: appVersions(),
      server: { version: serverVersion, lastBackup: readBackupStatus(backupStatusFile) },
    };
  });

  // The footer on every web page: just the server's version and the last backup.
  app.get('/web/server', async () => ({ version: serverVersion, lastBackup: readBackupStatus(backupStatusFile) }));

  app.post('/web/actions', async (req, reply) => {
    const body = WebActionsRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', message: body.error.message });
    const now = new Date().toISOString();
    const parsed: Action[] = [];
    for (const [index, raw] of body.data.actions.entries()) {
      const action = ActionBody.safeParse(raw);
      if (!action.success) return reply.code(400).send({ error: 'invalid_request', message: `Action ${index}: ${action.error.message}` });
      parsed.push({ id: randomUUID(), deviceId: DASHBOARD_DEVICE_ID, deviceTime: now, v: 1, ...action.data } as Action);
    }
    await ensureDashboard();
    // The dashboard runs on the server's clock: no offset.
    return applyActions(db, parsed, { deviceId: DASHBOARD_DEVICE_ID, clockOffsetMs: 0 });
  });
}
