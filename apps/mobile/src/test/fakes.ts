import type { PushRequest, RedeemRequest } from '@inventory/shared';
import type { Api, ApiError } from '../api/client';
import type { SessionStore } from '../session/session';
import type { PulledChanges } from '@inventory/shared';

export function memoryStore(initial: Record<string, string> = {}): SessionStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => {
      data[k] = v;
    },
    delete: async (k) => {
      delete data[k];
    },
  };
}

/**
 * A home server in memory. Each pushed Action moves its sequence number on by one; a pull returns
 * `rows` (whatever the test puts there) and the current sequence number.
 */
export interface FakeServer extends Api {
  seq: number;
  rows: PulledChanges;
  epoch: string;
  redeemed: RedeemRequest[];
  pulls: { key: string; since: number }[];
  pushes: { key: string; body: PushRequest }[];
  /** Action ids the server has taken, in arrival order. */
  received: string[];
  pullError?: ApiError | Error;
  pushError?: ApiError | Error;
  redeemError?: ApiError;
  /** Called during a push, before it answers. */
  duringPush?: () => Promise<void>;
}

export function fakeServer(): FakeServer {
  let keys = 0;
  const server: FakeServer = {
    seq: 10,
    rows: {},
    epoch: 'epoch-1',
    redeemed: [],
    pulls: [],
    pushes: [],
    received: [],
    async redeem(_server, body) {
      if (server.redeemError) throw server.redeemError;
      server.redeemed.push(body);
      keys += 1;
      return { deviceId: body.previousKey ? 'device-1' : `device-${keys}`, deviceKey: `key-${keys}`, name: body.name };
    },
    async pull(_server, key, since) {
      if (server.pullError) throw server.pullError;
      server.pulls.push({ key, since });
      return { seq: server.seq, changes: server.rows, app: { latest: null, minimum: '0.1.0' }, epoch: server.epoch };
    },
    async push(_server, key, body) {
      if (server.pushError) throw server.pushError;
      server.pushes.push({ key, body });
      await server.duringPush?.();
      const results = (body.actions as { id: string }[]).map((a) => {
        if (!server.received.includes(a.id)) {
          server.received.push(a.id);
          server.seq += 1;
        }
        return { id: a.id, outcome: 'applied' as const, mismatch: false };
      });
      return { seq: server.seq, app: { latest: null, minimum: '0.1.0' }, results };
    },
  };
  return server;
}
