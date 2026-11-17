# Own action-log sync instead of PowerSync

Devices sync with the home server through our own action log rather than a sync library. Each Device records domain Actions (e.g. "used 2 of a Supply"), with quantities as deltas, and pushes them over two plain endpoints (push unsent Actions, pull changes since a server sequence number). The server is the source of truth: it applies Actions in arrival order, takes "used" amounts from the oldest Batch at apply time, applies what it can and records a Mismatch for the rest, so sync never blocks on a human.

## Considered Options

- **PowerSync (self-hosted, Apache-2.0)**: rejected. It needs an extra service container and Postgres logical replication, and it brings its own phone storage layer. It uploads row changes by default, so domain Actions would have to be built on top of it anyway. Its strengths (scale, partial replication, live streaming) don't matter for one household with a handful of Devices on a LAN.
- **Replicache**: in maintenance mode. **Zero / ElectricSQL**: can't take offline writes from a phone. **CRDTs**: merge silently and never surface a Mismatch.

## Consequences

- We own the sync protocol, including Action versioning: the server reads every older Action version it knows, and refuses pushes from apps too old for it without losing the Actions still on the phone.
- A phone's displayed state is the server state plus its own unsent Actions, so what it shows can shift after a sync. That's expected.
- A "used" Action dated before a Supply's latest Stocktake (using the Device's clock corrected by its offset from the server) is skipped, so the count isn't reduced twice.
