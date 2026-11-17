import { eq, gt, max, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  Action,
  APP_VERSION_HEADER,
  type AppVersions,
  compareVersions,
  LATEST_ACTION_SHAPE_VERSION,
  PushRequest,
  type PushResponse,
  type PushResult,
  type SyncError,
  type SyncErrorCode,
} from '@inventory/shared';
import type { Db } from '../db/client.ts';
import {
  actions,
  assets,
  barcodes,
  batches,
  categories,
  devices,
  householdSettings,
  labels,
  locations,
  maintenanceEntries,
  mismatches,
  supplies,
} from '../db/schema.ts';
import { applyAction } from './apply.ts';
import { authenticateDevice } from './auth.ts';

/** Pushes are applied one at a time, in arrival order, across all Devices. */
const APPLY_LOCK = 7_311_001;

const STATUS: Record<SyncErrorCode, number> = {
  unknown_device: 401,
  device_removed: 401,
  invalid_request: 400,
  app_too_old: 426,
  server_too_old: 409,
};

function refuse(reply: FastifyReply, error: SyncErrorCode, message: string, app?: AppVersions) {
  const body: SyncError = { error, message, ...(app ? { app } : {}) };
  return reply.code(STATUS[error]).send(body);
}

async function currentSeq(db: Pick<Db, 'select'>): Promise<number> {
  const [row] = await db.select({ seq: max(actions.seq) }).from(actions);
  return row?.seq ?? 0;
}

export interface SyncRoutesOptions {
  db: Db;
  appVersions: () => AppVersions;
}

export function registerSyncRoutes(app: FastifyInstance, { db, appVersions }: SyncRoutesOptions): void {
  app.post('/sync/push', async (req, reply) => {
    const auth = await authenticateDevice(db, req.headers.authorization);
    if ('error' in auth) return refuse(reply, auth.error, 'This phone is not connected to this home server.');
    const { device } = auth;
    const versions = appVersions();

    const body = PushRequest.safeParse(req.body);
    if (!body.success) return refuse(reply, 'invalid_request', body.error.message);
    if (compareVersions(body.data.appVersion, versions.minimum) < 0) {
      return refuse(reply, 'app_too_old', 'Update needed to sync.', versions);
    }

    // Check every Action before applying any, so a refused push changes nothing.
    const parsed: Action[] = [];
    for (const [index, raw] of body.data.actions.entries()) {
      const v = (raw as { v?: unknown } | null)?.v;
      if (typeof v === 'number' && v > LATEST_ACTION_SHAPE_VERSION) {
        return refuse(reply, 'server_too_old', 'The home server is older than this app.', versions);
      }
      const action = Action.safeParse(raw);
      if (!action.success) return refuse(reply, 'invalid_request', `Action ${index}: ${action.error.message}`);
      if (action.data.deviceId !== device.id) {
        return refuse(reply, 'invalid_request', `Action ${index} belongs to another Device.`);
      }
      parsed.push(action.data);
    }

    const clockOffsetMs = Date.now() - Date.parse(body.data.deviceNow);

    const { results, seq } = await applyActions(db, parsed, {
      deviceId: device.id,
      clockOffsetMs,
      deviceUpdate: { clockOffsetMs, appVersion: body.data.appVersion },
    });

    const response: PushResponse = { seq, app: versions, results };
    return response;
  });

  app.get<{ Querystring: { since?: string } }>('/sync/pull', async (req, reply) => {
    const auth = await authenticateDevice(db, req.headers.authorization);
    if ('error' in auth) return refuse(reply, auth.error, 'This phone is not connected to this home server.');
    const since = Number(req.query.since ?? 0);
    if (!Number.isInteger(since) || since < 0) return refuse(reply, 'invalid_request', 'since must be a whole number');

    const snap = await snapshot(db, since);

    // Every sync reports the app version, so the Device list can flag out-of-date phones.
    const reported = req.headers[APP_VERSION_HEADER];
    const appVersion = typeof reported === 'string' && /^\d+\.\d+\.\d+$/.test(reported) ? reported : undefined;
    await db
      .update(devices)
      .set({ lastSyncedAt: new Date(), ...(appVersion ? { appVersion } : {}) })
      .where(eq(devices.id, auth.device.id));
    return { ...snap, app: appVersions() };
  });
}

/**
 * Applies Actions in arrival order, one push at a time across all Devices, inside one transaction.
 * Safe to retry: an Action already received keeps its first outcome. Used by phone pushes and by the
 * dashboard.
 */
export async function applyActions(
  db: Db,
  parsed: Action[],
  {
    deviceId,
    clockOffsetMs,
    deviceUpdate,
  }: { deviceId: string; clockOffsetMs: number; deviceUpdate?: { clockOffsetMs: number; appVersion: string } },
): Promise<{ results: PushResult[]; seq: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${APPLY_LOCK})`);
    const results: PushResult[] = [];
    for (const action of parsed) {
      const [seen] = await tx.select().from(actions).where(eq(actions.id, action.id));
      if (seen) {
        const [raised] = await tx.select({ id: mismatches.id }).from(mismatches).where(eq(mismatches.actionId, action.id));
        results.push({ id: action.id, outcome: seen.outcome, mismatch: Boolean(raised) });
        continue;
      }
      const correctedTime = new Date(Date.parse(action.deviceTime) + clockOffsetMs);
      const [{ seq }] = (await tx
        .insert(actions)
        .values({
          id: action.id,
          deviceId,
          type: action.type,
          shapeVersion: action.v,
          payload: action.payload,
          deviceTime: new Date(action.deviceTime),
          correctedTime,
          outcome: 'skipped',
        })
        .returning({ seq: actions.seq })) as [{ seq: number }];
      const outcome = await applyAction(tx, action, { seq, correctedTime });
      await tx.update(actions).set({ outcome: outcome.outcome, result: outcome.result, changedSeq: seq }).where(eq(actions.seq, seq));
      if (outcome.mismatch) {
        await tx.insert(mismatches).values({
          kind: outcome.mismatch.kind,
          actionId: action.id,
          details: outcome.mismatch.details,
          changedSeq: seq,
        });
      }
      results.push({ id: action.id, outcome: outcome.outcome, mismatch: Boolean(outcome.mismatch || outcome.raisedMismatch) });
    }
    if (deviceUpdate) {
      await tx
        .update(devices)
        .set({ ...deviceUpdate, lastSyncedAt: new Date() })
        .where(eq(devices.id, deviceId));
    }
    return { results, seq: await currentSeq(tx) };
  });
}

/** Everything changed after `since` (everything for 0), as one consistent snapshot up to `seq`. */
export async function snapshot(db: Db, since: number) {
  // One consistent snapshot: rows changed after `since`, up to the `seq` returned.
  return db.transaction(
    async (tx) => {
      // since=0 is a Device's first full sync: everything, including rows no Action has touched yet.
      const changed = (table: { changedSeq: AnyPgColumn }) => (since === 0 ? undefined : gt(table.changedSeq, since));
      return {
        seq: await currentSeq(tx),
        changes: {
          settings: await tx.select().from(householdSettings).where(changed(householdSettings)),
          categories: await tx.select().from(categories).where(changed(categories)),
          locations: await tx.select().from(locations).where(changed(locations)),
          supplies: await tx.select().from(supplies).where(changed(supplies)),
          barcodes: await tx.select().from(barcodes).where(changed(barcodes)),
          batches: await tx.select().from(batches).where(changed(batches)),
          assets: await tx.select().from(assets).where(changed(assets)),
          maintenanceEntries: await tx.select().from(maintenanceEntries).where(changed(maintenanceEntries)),
          labels: await tx.select().from(labels).where(changed(labels)),
          mismatches: await tx.select().from(mismatches).where(changed(mismatches)),
          actions: await tx
            .select({
              seq: actions.seq,
              id: actions.id,
              deviceId: actions.deviceId,
              type: actions.type,
              payload: actions.payload,
              correctedTime: actions.correctedTime,
              outcome: actions.outcome,
              result: actions.result,
              reversedByActionId: actions.reversedByActionId,
            })
            .from(actions)
            // Old Actions come again when an Undo or Correction changes them.
            .where(gt(actions.changedSeq, since))
            .orderBy(actions.seq),
          // Device names, for "Undone by Kitchen phone" in history. Few rows, so always all.
          devices: await tx.select({ id: devices.id, name: devices.name }).from(devices),
        },
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
