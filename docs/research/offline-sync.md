# Offline sync with a server at home

Research for [#4](https://github.com/anuarmusa/Inventory/issues/4). Feeds the decision ticket "Design offline sync and how mismatched counts get fixed" (#9).

Researched 2026-11-17. Release dates and activity come from the GitHub API on that date unless another source is given.

## The question

A few phones (Android and iPhone) each keep a local database. They stay offline for hours and sync with a self-hosted server on the home LAN (Ubuntu, Docker) once they're back on home Wi-Fi. Nothing may depend on a cloud service. The app is likely TypeScript and cross-platform, such as React Native or Expo, though that isn't decided yet.

The principle is already decided. Sync records the **actions** each Device took ("used 2 eggs"), not the latest value of a count. Mismatches, such as a Supply going negative, are shown to a person to fix.

For that principle, what matters about each option is:

1. Can a Device record actions offline and upload them later, in order?
2. Does the server apply them and decide the true state, rather than a last-write-wins merge of counts?
3. Does it run on a home server with no cloud account, licence server or hosted dashboard?
4. Does it work in React Native or Expo?
5. Is it maintained?

## Summary

- **The tools split into two groups.**
  - Some sync rows or documents and resolve conflicts themselves: WatermelonDB, CouchDB/PouchDB, RxDB's default handler, Triplit, and CRDTs. With these, the action model has to be layered on top as an insert-only "actions" table or collection.
  - Others send client writes to *your* server code, which decides the result: PowerSync, Replicache, and a hand-rolled log. These fit the decided principle most directly.
- **Ruled out by a hard constraint:**
  - Zero: no offline writes.
  - ElectricSQL: syncs reads only, and its local database doesn't run in React Native.
- **Has a cost:** RxDB's production SQLite storage for React Native is part of a paid plan. The free version is capped at 500 documents.
- **Little recent activity:** Triplit, WatermelonDB, and Replicache (officially in maintenance mode).

## Options

### PowerSync (self-hosted Open Edition)

- **Self-hosting:** The service ships as a Docker image (`journeyapps/powersync-service`), and the PowerSync CLI can generate a Docker Compose stack. The hosted dashboard isn't available when self-hosting. ([self-hosting docs](https://docs.powersync.com/self-hosting/getting-started))
  - It replicates from a source database: Postgres or MongoDB, with MySQL and SQL Server in beta. ([database setup](https://docs.powersync.com/installation/database-setup))
  - A minimal home stack is therefore source database + PowerSync service + your own backend API.
  - The docs don't mention a licence key for the Open Edition. ([self-hosting docs](https://docs.powersync.com/self-hosting/getting-started))
- **Licence and cost:**
  - Older service versions use the Functional Source License (FSL-1.1-ALv2), which allows internal use. The licence changed to Apache 2.0 on 2026-11-03. ([PowerSync FSL page](https://www.powersync.com/legal/fsl))
  - The GitHub repo now reports Apache-2.0 ([powersync-service](https://github.com/powersync-ja/powersync-service)).
  - A paid Enterprise Self-Hosted Edition also exists. ([self-hosting docs](https://docs.powersync.com/self-hosting/getting-started))
- **Concurrent edits:**
  - Local writes go into an upload queue of `PUT`/`PATCH`/`DELETE` operations. Your `uploadData()` sends them to your own API, which applies them to the source database. ([writing client changes](https://docs.powersync.com/installation/app-backend-setup/writing-client-changes))
  - PowerSync calls this "server-authoritative reconciliation". Without custom logic, the result is per-field last-write-wins. The backend must be idempotent and may reject writes. ([handling update conflicts](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts))
  - Validation failures should return 2xx, because otherwise "the client SDK retries the upload indefinitely, which blocks the upload queue". Errors can be reported back through a synced table. ([writing client changes](https://docs.powersync.com/installation/app-backend-setup/writing-client-changes))
- **Fit with the action model:** Good, but done by convention.
  - There's no first-class "operation" type. Increments are listed only as a possible future custom operation. ([handling update conflicts](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts))
  - An insert-only `actions` table would upload as `PUT`s. The server would then apply each action and write the resulting counts and any "mismatch" rows, which sync back down. (This is our design inference, not a documented PowerSync pattern.)
- **React Native / Expo:**
  - Uses `@powersync/react-native` with `@op-engineering/op-sqlite`.
  - The native adapter "is not compatible with Expo Go's sandbox environment", so it needs a development build. A JavaScript adapter exists for Expo Go.
  - ([React Native & Expo SDK](https://docs.powersync.com/client-sdk-references/react-native-and-expo))
- **Maturity:**
  - Service v1.28.3 was released 2026-11-12, and the JS SDK monorepo was pushed 2026-11-16 ([powersync-service](https://github.com/powersync-ja/powersync-service), [powersync-js](https://github.com/powersync-ja/powersync-js)).
  - Very active, backed by a company.

### ElectricSQL

- **Self-hosting:**
  - Ships as a Docker image (`electricsql/electric`) and needs Postgres 14+ with logical replication.
  - Electric Cloud is optional.
  - ([deployment](https://electric.ax/docs/guides/deployment))
- **Licence:** Apache-2.0 ([GitHub](https://github.com/electric-sql/electric)).
- **Concurrent edits:**
  - "Electric does not do write-path sync." You build writes yourself.
  - The only pattern with full offline support is "through-the-database sync": a local database (PGlite in the example), triggers that log changes, and a background uploader.
  - ([writes guide](https://electric.ax/docs/guides/writes))
- **Fit with the action model:** The "triggers log changes, then upload" pattern is close to an action log, but you write all of it.
- **React Native / Expo:**
  - The TypeScript client works in Expo, but "PGlite doesn't yet work in React Native". ([Expo integration](https://electric.ax/docs/sync/integrations/expo))
  - So on phones, Electric only helps with downloading server state.
- **Maturity:** Sync service 1.8.1 was released 2026-09-07 and the repo was pushed 2026-11-13. Active ([GitHub](https://github.com/electric-sql/electric)).

### RxDB and its replication plugins

- **Self-hosting:** Replication is a protocol you implement. HTTP, GraphQL, WebSocket and CouchDB plugins can all point at your own server. ([replication](https://rxdb.info/replication.html))
  - The HTTP variant needs a pull endpoint (checkpoint-based), a push endpoint that returns conflicting documents, and an optional change stream. ([HTTP replication](https://rxdb.info/replication-http.html))
- **Licence and cost:**
  - The core is Apache-2.0 ([GitHub](https://github.com/pubkey/rxdb)).
  - The production SQLite storage is in the `rxdb-premium` package. The free `getRxStorageSQLiteTrial` is "limited to store 500 non-deleted documents", uses no indexes and is meant for prototypes. ([SQLite storage](https://rxdb.info/rx-storage-sqlite.html))
  - The premium page lists SQLite (React Native) and Expo Filesystem storage under Pro, at $99/month billed annually, with no free trial. ([premium](https://rxdb.info/premium/))
  - The pricing page is internally inconsistent about which storages are free. Confirm with the vendor before relying on it.
- **Concurrent edits:**
  - Document-level, git-like. Pushes carry the `assumedMasterState`, and the server reports conflicts.
  - "RxDB resolves all conflicts on the client". The default handler "will always drop the fork state and use the master state".
  - ([replication](https://rxdb.info/replication.html))
- **Fit with the action model:** Only as an insert-only actions collection, which never conflicts, plus server-computed state documents pulled back down. Resolving conflicts on the client runs against "the server decides".
- **React Native / Expo:** Supported through SQLite (bare React Native or `expo-sqlite`) or the premium Expo Filesystem storage. ([React Native database](https://rxdb.info/react-native-database.html))
- **Maturity:** 17.6.0 was released 2026-10-05 and the repo was pushed 2026-11-17. Very active ([GitHub](https://github.com/pubkey/rxdb)).

### WatermelonDB sync

- **Self-hosting:** WatermelonDB is "only a local database — you need to bring your own backend". The built-in sync adapter needs two endpoints that follow its protocol. ([sync intro](https://watermelondb.dev/docs/Sync/Intro))
- **Licence:** MIT ([GitHub](https://github.com/Nozbe/WatermelonDB)).
- **Concurrent edits:**
  - Sync exchanges state, not events. Pull returns `created`/`updated`/`deleted` record sets since `lastPulledAt`. Push "MUST be fully transactional".
  - If a pushed record was modified on the server after `lastPulledAt`, the server "MUST abort push", and the client pulls again. ([sync backend](https://watermelondb.dev/docs/Sync/Backend))
  - A `conflictResolver` hook can customise the merge. ([sync frontend](https://watermelondb.dev/docs/Sync/Frontend))
- **Fit with the action model:** Only through an insert-only actions table. Created records don't conflict, and the server derives counts. A record-level abort on concurrent edits to a count row is exactly what the action model avoids.
- **React Native / Expo:**
  - Built for React Native, with native modules, CocoaPods on iOS and optional JSI.
  - The installation docs don't mention Expo. ([installation](https://watermelondb.dev/docs/Installation))
- **Maturity:**
  - The latest tag is v0.28.1-0 (pre-release). The last commit on the default branch was 2025-08-11, and the repo was pushed 2026-09-16 ([GitHub](https://github.com/Nozbe/WatermelonDB)).
  - Slow: no stable release in over a year.

### CouchDB / PouchDB

- **Self-hosting:**
  - CouchDB publishes official Docker images (`apache/couchdb`). ([CouchDB Docker](https://docs.couchdb.org/en/stable/install/docker.html))
  - There's no extra sync service, because CouchDB *is* the sync server.
  - Licence: Apache 2.0 ([couchdb.apache.org](https://couchdb.apache.org/)).
- **Concurrent edits:**
  - Replication keeps every conflicting revision. A deterministic but "arbitrary" winner is picked, conflicts are hidden from plain reads, and "the application must resolve" them by deleting the losing revisions. ([conflicts](https://docs.couchdb.org/en/stable/replication/conflicts.html))
  - The same page notes that a list that is only ever appended to can be merged by union. ([conflicts](https://docs.couchdb.org/en/stable/replication/conflicts.html))
- **Fit with the action model:**
  - Natural for the log: one document per action never conflicts.
  - But CouchDB has no server-side code that decides the true count when a document arrives. You'd need a separate worker that reads the `_changes` feed and writes derived documents. (That's our inference.)
- **React Native / Expo:**
  - PouchDB needs a community adapter. `pouchdb-adapter-react-native-sqlite` (MIT, v4.4.2, pushed 2026-11-12) runs on op-sqlite ([GitHub](https://github.com/craftzdog/pouchdb-adapter-react-native-sqlite)), so it needs a development build rather than Expo Go.
- **Maturity:**
  - CouchDB 3.5.3 was released 2026-10-12 ([couchdb.apache.org](https://couchdb.apache.org/)).
  - PouchDB's last release was 9.0.0 on 2024-06-21. Commits continue, the latest on 2026-11-04 ([GitHub](https://github.com/pouchdb/pouchdb)).
  - Both are long-lived Apache projects.

### CRDT libraries: Automerge and Yjs

- **Self-hosting:**
  - Both are libraries and don't care about the network. Automerge works with a central server but doesn't need one. ([Automerge intro](https://automerge.org/docs/hello/))
  - Yjs uses WebSocket, WebRTC or other adapters, plus persistence providers. ([Yjs docs](https://docs.yjs.dev/))
  - A home server would run your own relay and persistence.
- **Licence:** Both MIT ([Automerge](https://github.com/automerge/automerge), [Yjs LICENSE](https://github.com/yjs/yjs/blob/main/LICENSE)).
- **Concurrent edits:**
  - Merges happen automatically, with no conflicts. Automerge keeps change history ([intro](https://automerge.org/docs/hello/)).
  - Automerge's counter type sums concurrent increments, giving 3 + 2 + 3 = 8 rather than one overwriting the others ([counters](https://automerge.org/docs/reference/documents/counters/)).
- **Fit with the action model:**
  - Counters capture "used 2 eggs" as increments.
  - But merges always succeed by design. A Supply simply goes negative, and nothing in the library flags that for a person. Detecting mismatches would still need server-side code.
  - Yjs is aimed mainly at collaborative editors (ProseMirror, Monaco and similar). ([Yjs docs](https://docs.yjs.dev/))
- **React Native / Expo:**
  - Automerge's JS package is Rust compiled to WebAssembly. Its docs cover React Native only for Metro package-exports configuration. ([library initialization](https://github.com/automerge/automerge.github.io/blob/main/content/docs/reference/library-initialization.md))
  - Hermes, React Native's default engine, doesn't currently run WebAssembly ([hermes#1074](https://github.com/facebook/hermes/discussions/1074), [hermes#395](https://github.com/facebook/hermes/issues/395)). This is a real risk.
  - Yjs is pure JS.
- **Maturity:**
  - Automerge 3.5.0 was released 2026-09-16 and Yjs v13.6.33 on 2026-09-23 ([Automerge](https://github.com/automerge/automerge), [Yjs](https://github.com/yjs/yjs)).
  - Both are active.

### Replicache and Zero (Rocicorp)

- **Replicache:**
  - **Status, licence and cost:** "Replicache is now in maintenance mode." "We have open-sourced the code and no longer charge for its use." ([replicache.dev](https://replicache.dev/)) The old repo is archived. Its last release there was v10.0.0 (2022), and the code now lives in [rocicorp/mono](https://github.com/rocicorp/mono) (Apache-2.0).
  - **Concurrent edits:**
    - Mutators are named functions. Each call is recorded as a mutation (name + arguments) with a per-client sequence number and kept as pending.
    - On push, "the server runs its own mutator implementation", and the server is authoritative.
    - On pull, the client rewinds to server state and replays the still-pending mutations.
    - Conflicts are handled in "defensively written, programmatic mutation logic", such as recording a failed-booking flag.
    - ([how it works](https://doc.replicache.dev/concepts/how-it-works))
  - **Fit with the action model:** The closest of any library. Mutations *are* actions, replayed by server code that can flag mismatches.
  - **Self-hosting:** Push and pull are your own endpoints. ([how it works](https://doc.replicache.dev/concepts/how-it-works))
  - **React Native:** Only through community `kvStore` bindings such as `@react-native-replicache/react-native-op-sqlite`. Third-party trackers flag these as infrequently released ([socket.dev](https://socket.dev/npm/package/@react-native-replicache/react-native-op-sqlite)).
  - **Maturity:** Frozen. No new features.
- **Zero:**
  - Zero "does not support offline writes" and is "not designed for long periods offline". Writes are rejected while disconnected. ([Zero offline](https://zero.rocicorp.dev/docs/offline))
  - **Ruled out** by the hours-offline requirement.
  - It is actively released: zero/v1.12.0 was tagged 2026-11-12 ([rocicorp/mono](https://github.com/rocicorp/mono)).

### Triplit

- **Self-hosting:** It has a Node sync server you can run yourself. The README lists "Offline-mode", "conflict resolution at the property level", CRDTs, and pluggable SQLite storage. The TriplitDB package targets React Native among other runtimes. ([README](https://github.com/aspen-cloud/triplit))
- **Licence:** AGPL-3.0 ([GitHub](https://github.com/aspen-cloud/triplit)). Running it unmodified for one household has no practical AGPL obligation, but it constrains any modified, network-exposed redistribution.
- **Concurrent edits:** Property-level CRDT merge, so per-attribute convergence rather than an action log. ([README](https://github.com/aspen-cloud/triplit))
- **Maturity:**
  - The last package release was @triplit/solid@1.0.34 on 2025-07-31. The latest commits are from 2025-09-11 ([GitHub](https://github.com/aspen-cloud/triplit)).
  - Supabase hired Triplit's co-founder on 2025-10-08 ([Supabase blog](https://supabase.com/blog/triplit-joins-supabase)).
  - Development appears to have largely stopped.

### Hand-rolled append-only action log with server-assigned order

- **Shape:**
  - Each Device writes actions (Device id, per-Device sequence number, type, payload, local time) to an `actions` table in local SQLite and applies them optimistically to local state.
  - On sync, it POSTs unacknowledged actions. The server dedupes by (Device, sequence), assigns a global order, applies each action in a transaction and records any mismatch, such as a negative Supply.
  - The server returns the log or derived state since the Device's last cursor. The Device then rebases its unsent actions on that state.
  - This is the same pattern Replicache documents ([how it works](https://doc.replicache.dev/concepts/how-it-works)), without the library.
- **Self-hosting:** Entirely your own containers (API + Postgres or SQLite).
- **Licence and cost:** None.
- **React Native / Expo:**
  - `expo-sqlite` is included in Expo Go and runs on Android and iOS. ([expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/))
  - It also exposes the SQLite session extension (`createChangesetAsync`/`applyChangesetAsync`), which could help with the download direction. ([expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/))
- **Fit with the action model:** Exact, because the decided principle *is* this design.
- **Costs:**
  - You own all of it: idempotency, cursors, schema migrations across app versions, rebasing local optimistic state, initial sync, and testing.
  - PowerSync and Replicache document each of these concerns (idempotent uploads, a blocked queue on errors, rebase), which shows the work involved. ([PowerSync writes](https://docs.powersync.com/installation/app-backend-setup/writing-client-changes), [Replicache](https://doc.replicache.dev/concepts/how-it-works))

## Comparison

| Option | No cloud, self-hosted | Licence / cost | How concurrent edits resolve | Fit with action log + human-fixed mismatches | React Native / Expo | Maintenance (as of 2026-11-17) |
|---|---|---|---|---|---|---|
| PowerSync Open Edition | Yes. Docker service + Postgres/Mongo + your API | Apache-2.0 since 2026-11-03 (FSL before) | Your backend decides; default per-field LWW | Good. Insert-only actions table, server applies and flags | Yes; native adapter needs a dev build, JS adapter for Expo Go | Very active (v1.28.3, Nov 2026) |
| ElectricSQL | Yes. Docker + Postgres 14 with logical replication | Apache-2.0 | No write path; build your own | Reads only; writes are DIY | Client yes; PGlite not on RN | Active |
| RxDB | Yes. Your endpoints | Core Apache-2.0; production RN SQLite storage paid (Pro $99/mo), free trial capped at 500 docs | Document revisions; conflicts resolved on the client | Possible with insert-only collection; client-side resolution is off-model | Yes (SQLite, Expo FS premium) | Very active |
| WatermelonDB | Yes. Your endpoints | MIT | Record-level: push aborts if changed since pull | Possible with insert-only table; state-based protocol | RN native; Expo not documented | Slow (last commit Aug 2025, pre-release tag) |
| CouchDB / PouchDB | Yes. Official Docker image | Apache-2.0 | Keeps all revisions, arbitrary winner, app resolves | Log of action docs works; needs a separate worker to compute state and flags | Community adapter (op-sqlite), dev build | CouchDB active; PouchDB release 2024, commits ongoing |
| Automerge / Yjs | Yes. Your relay and storage | MIT | CRDT auto-merge; counters sum | Captures increments, but never flags mismatches | Automerge needs WASM (Hermes lacks it); Yjs pure JS | Active |
| Replicache | Yes. Your endpoints | Open source, free | Server re-runs named mutations; client rebases | Closest match: mutations are actions | Community kvStore only | Maintenance mode, no new features |
| Zero | Yes | Apache-2.0 | n/a | n/a | n/a | Active, but **no offline writes** |
| Triplit | Yes. Node server | AGPL-3.0 | Property-level CRDT | Off-model | Claims RN support | Stalled since 2025 |
| Hand-rolled log | Yes | None | Server orders and applies; your code flags | Exact | expo-sqlite works in Expo Go | Whatever you maintain |

## Trade-offs for the decision ticket

1. **Who decides the true count.** The action principle needs server code that applies actions in a known order and writes mismatch records. These tools give you that hook directly:
   - PowerSync, via your upload API.
   - Replicache, via its server mutators.
   - A hand-rolled log.

   With CouchDB, RxDB, WatermelonDB and the CRDTs, the hook has to be added on top, as an insert-only log plus a server-side worker. CRDTs in particular "merge without conflicts", so a negative Supply wouldn't be noticed unless code looks for it.
2. **Build vs. depend.**
   - PowerSync takes care of the hard parts: local SQLite, the upload queue, checkpoints and partial sync. In exchange it adds a source database and a sync service to the home server, and an upload model of `PUT`/`PATCH`/`DELETE` rows that the action log is shaped to fit.
   - A hand-rolled log has no dependencies and matches the domain exactly. You'd write and test retry, idempotency, rebase and migrations yourself.
   - Replicache's design is the best blueprint for that work, even if the library itself isn't used, since it's frozen and has no maintained React Native storage.
3. **Server database choice is coupled.** PowerSync needs Postgres or MongoDB (MySQL and SQL Server are beta), and Electric needs Postgres with logical replication. A hand-rolled log or CouchDB leaves the server database open.
4. **Expo Go vs. development builds.** Every option built on a native SQLite binding (PowerSync native, op-sqlite, WatermelonDB, the PouchDB adapter) needs a custom development build. Only `expo-sqlite`-based approaches run in Expo Go. This affects how test builds are made and installed.
5. **Cost and longevity.**
   - RxDB is the only option with a recurring fee for production use on phones.
   - Zero is ruled out by offline writes, and Electric by having no write path and no React Native database.
   - Triplit, WatermelonDB and Replicache have little or no forward development.
