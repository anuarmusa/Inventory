# Build decisions

Decisions made while building v1 ([`docs/spec/v1.md`](spec/v1.md)) that the spec left open. One section per slice, newest last. Each entry says what was chosen and why, so it can be revisited.

## Before this log (slices #19–#29)

- **Phone storage**: the phone keeps the server's rows as JSON in one `server_rows` table, so a server column added later needs no phone migration. Unsent Actions sit in `unsent_actions`, in the order they were taken.
- **One sync = push, pull, then one local save** that stores rows and drops accepted Actions together. If the pull fails, the Actions are pushed again later; the server ignores repeats.
- **Removed phone reconnecting as a new Device**: its Unsent Actions move to the new Device instead of being stuck.
- **Shopping list ticks** stay on the phone (not Actions) and clear when the Supply leaves the list.
- **Scan basket**: lives in memory only; Put away checks every Action before recording any. New Supplies get no Category or minimum; their usual Location is where their first line goes.
- **Review allows changing how many**, for scans that went wrong.
- **Undo toast**: the sync after Save waits for the toast (6 s), so Undo drops the Unsent Action and nothing reaches history.

## Undo and Correction (#26)

- **Exact reversal from what was recorded.** Each Undo stores the inverse of what it changed (Batch quantity changes and column values), so undoing an Undo restores the original exactly and Corrections chain.
- **`actions.reversed_by_action_id`** marks an Action reversed while that Undo/Correction stands. It is cleared when the Undo is undone. **`actions.changed_seq`** lets phones pull old Actions again when an Undo changes them.
- **The pull now carries Device names** (`devices`: id and name, every time) for "Undone by Kitchen phone, 18 Nov".
- **What can be undone**:
  - used, Stocktake, added a Batch, thrown away, moved (Batch or Asset), Disposed, deleted, and created (which hides it);
  - Barcode moved, and Mismatch resolved (which reopens it).

  Merge can't be undone. Detail edits, Barcodes attached, Labels and maintenance are fixed by editing again, so the server skips their Undo quietly.
- **A later Stocktake wins**: the Undo or Correction is recorded and marks the original, but amounts stay as counted.
- **Undoing "added a Batch"** removes what's left. The part already used becomes a shortfall Mismatch raised by the Undo.
- **Correction must keep the Action's type.** The app's **Fix** changes the amount only (used, Stocktake, added, thrown away). "Milo, not rice" is supported by the server, but the app has no screen for it yet.
- **History shows originals only.** Undo and Correction entries appear on the original as "Undone by …" / "Fixed: 3, not 2", following the chain to the Correction that stands. An undone entry offers **Bring back**, which undoes the Undo.
- **Unsent Undo/Correction** are replayed on the phone from the server's recorded result. An Undo of an Undo shows once the server has applied it.
- **Put away also gets the Undo toast**, which drops every Action it recorded.
- **Asset History** is computed by the same code; it shows once the Asset page exists ("Assets and Locations in the app").

## Mismatch fixes and Merge (#25)

- **Fixes per Mismatch** (spec §4.4):
  - **Shortfall:** Count it (a Stocktake screen, then resolved as counted) or Accept.
  - **Skipped Action:** Accept, or "Redo it on another Supply". Redo is only offered when the Action was a "used" or Stocktake on a Supply that is gone; other skipped Actions are only accepted.
  - **Barcode on two Supplies:** Keep on the first, Move to the other (`barcode.moved`), or Merge the two.
  - **Blank label attached to two things:** only "Keep it there". There is no Action to move a Label to another thing, and Replace Label belongs to the dashboard (#34).
- **Merge** asks which Supply keeps everything, shows each one's amount (duplicates often share a name), and confirms with "This can't be undone".
- **Possible duplicate**: another live Supply with the same name, ignoring case and spaces. It shows as a hint on the Supply page with a link to Merge. It is not a Mismatch.
- **Resolved Mismatches stay in history**: the Needs checking screen lists the last 20 under "Checked", with how each was resolved.
- **The Count it screen** (`/count/[supplyId]`) is a plain Stocktake of one Supply, so the Location page's "Count what's here" (#30) can reuse it.

## Assets and Locations in the app, and editing (#30)

- **Ways in from Home**: a row of links (Supplies, Assets, Recent activity, Settings) under the Scan button. The Supplies and Assets lists have search and a "+ New" button. Asset value is not shown on the phone (spec §6.1).
- **Count what's here** lists the Supplies kept at that Location. Each opens the one-Supply Stocktake, and the screen says a count sets the Supply's whole amount wherever it's kept, because a Stocktake is per Supply (spec §4.3).
- **Forms send only what changed** (`supply.edited` / `asset.edited` with changed fields), since detail edits are last-writer-wins per field. Saving with nothing changed records nothing.
- **Delete vs Dispose**: Delete (for mistakes) sits at the bottom of the edit form and explains that it hides the thing and can be undone. Dispose is on the Asset page with reasons Sold / Thrown away / Broken / Given away, or a typed reason, dated today.
- **Log maintenance** is dated today, with an optional cost in RM. Money is typed as "2899", "2,899.50" or "RM 85" and stored in sen.
- **Dates in forms** are typed day/month/year, with no date-picker library (none is installed, and adding one needs a native rebuild).
- **Settings** holds Locations and Categories (add, rename, delete only when empty, with a message saying what's in the way) and links to Unsent changes. The household Near-expiry default stays at 7 days: no Action changes it in v1.
- **Photos** show as a count on the Asset page until "Photos: upload, cache and resize" (#31).

## Labels in the app (#32)

- **A Blank label is any `INV1:` code linked to nothing**, including codes the household has never seen. Printed sheets of blank Labels aren't recorded anywhere until one is attached, and `label.attached` creates the Label on the server.
- **Scanning a Label opens its page from the camera.** The basket stays in the scan screens underneath, and the camera ignores what it sees while a page is on top, so it doesn't open the same Label twice.
- **A retired Label** shows "This Label was replaced. Use the new Label on this thing." on the camera screen, rather than opening the thing.
- **"No Label yet"** on Asset and Location pages adds "scan a Blank label to attach one", because attaching starts from the scan.
- **Attach to a new Asset** opens the new-Asset form, then records `asset.created` and `label.attached` together.

## Photos: upload, cache and resize (#31)

- **Server**:
  - `PUT /photos/:id` takes the photo as `image/jpeg` and needs the Device key. It is limited to 5 MB, far above a resized photo. A repeat upload is accepted without rewriting the file.
  - `GET /photos/:id` is open on the LAN, like the rest of the dashboard API, so the web can show photos.
  - Files are stored as `<photos folder>/<id>.jpg`, with `PHOTOS_DIR` defaulting to `apps/server/photos` (git-ignored) on the dev PC and `/data/photos` in the image. The dev Compose file keeps `/data` in an `app-data` volume; the production `/srv/inventory` mapping comes with the deployment tooling (#38).
- **Phone**:
  - It takes or picks a photo (`expo-image-picker`), resizes it to 1600 px on the long edge (never upscaling), saves it as JPEG at 0.8 quality (`expo-image-manipulator`), keeps it in the documents folder, and queues its id in `app_meta.pending_photos`.
  - The Action naming the photo is recorded at once. The file uploads after each successful sync, oldest first, and stops at the first sign of being away.
  - Other phones download a photo on first view into the cache folder. Away from home, an uncached photo shows a "Photo at home" placeholder.
- **Where photos appear**: Asset photos and the receipt photo, on the Asset page. Barcode photos (from new products) aren't taken in v1; the field stays empty.
- **Two phones adding photos to the same Asset at once**: `photoIds` is a detail edit, so the last one to arrive wins and the other photo is dropped from the list (the file stays on the server). This is rare in a household, and accepted for v1.
- **New native modules** (image picker, image manipulator, file system) mean the next APK build is needed before photos work on a phone.

## App updates (#36)

- **The banner's "what's new"** comes from `latest.json`'s `notes`, now carried in every sync answer (`app.notes`), so there is still no separate polling.
- **Every sync reports the app version.** The push already sent it; pulls now send an `x-app-version` header and the server records it. A phone that only ever pulls still shows its version in the Device list, which already flags out-of-date Devices.
- **The phone remembers the last reported versions** (`app_meta.app_versions`), so the banner shows offline after a restart. "Later" dismisses one version only; the next version shows again.
- **Red "Update needed to sync"** shows when this app is below the reported minimum, or when a push was refused as too old. It can't be dismissed, and it explains that changes wait on the phone.
- **Update**:
  1. Syncs first (only when the server still accepts this version).
  2. Downloads `/apk/download` into the cache folder.
  3. Opens Android's installer with a content URI (`expo-intent-launcher`, `REQUEST_INSTALL_PACKAGES`).

  The first time, a note explains Android's "Install unknown apps" switch. If the download fails, the app points to the download page as the fallback.
- **New native module** (`expo-intent-launcher`) and a new permission, so the next APK build is needed before Update works on a phone.

## Alerts: daily summary notification (#37)

- **Planned ahead, not computed at 09:00.** Android doesn't reliably run app code in the background at a set time. So whenever the phone's data changes (it waits 3 s for a sync or basket to settle), it works out Low stock and Near expiry with the shared rules (the same lists as Home) and schedules one local notification for the next 09:00 with what's new. If nothing is new, it cancels it. There is no server involvement.
- **"New"** means not yet in a summary whose 09:00 has passed. Something that stops being Low stock or Near expiry is forgotten, so it counts as new if it comes back. Replanning before 09:00 doesn't count the pending summary as sent.
- **Text**: title "2 Low stock, 1 Near expiry"; body "Low stock: Jasmine rice (1 left), …. Near expiry: Fresh milk (in 2 days)." Up to four names per kind, then "and N more".
- **Permission** is asked the first time there is something to tell, not at first launch.
- **Limit**: if the phone isn't opened for days, the 09:00 summary reflects what it knew when it was last open. That's acceptable, since Alerts are about the phone's own data.
- **New native module** (`expo-notifications`), so the next APK build is needed.

## Web dashboard (#33)

- **One set of view rules for phone and web.** The phone's pure view code moved to `packages/shared/src/view`: the local view and replay, Home's lists, Action descriptions, Needs checking, History, the forms, Supply details and dates. The dashboard computes exactly what the phones show, from the same rows.
- **The dashboard is a Device.** `POST /web/actions` records Actions as the "Dashboard" Device (a fixed id, created on first use, whose key is never usable), on the server's clock. Its changes show in History as "Dashboard" and can be undone like a phone's. `GET /web/state` returns the full snapshot (same as a first pull) plus the footer details. Both are open on the LAN, like the rest of the server (no login in v1).
- **Refreshing**: the dashboard reloads every 30 s and after each change. It does not stream.
- **Layout (variant A)**: Needs checking across the top only when Mismatches are open; a 2×2 grid (Shopping list, Near expiry, Low stock, Assets with the total for Assets still owned); Recent activity in a sidebar with Device, time and Undo / Bring back.
- **Fixes on the web**: Count it opens an inline count box, Redo opens a Supply picker, and Merge confirms with the browser's dialog ("This can't be undone").
- **Shopping list ticks** are kept in the browser (`localStorage`), like a phone keeps its own.
- **Editing**: Supplies, Assets, and Locations & Categories pages with the same forms and rules as the phone (only changed fields sent; Delete hides and can be undone; Locations and Categories delete only when empty). Moving, maintenance and Dispose stay on the phone's Asset page.
- **Footer on every web page** (download page included): "Server v0.1.0" from the server package's version (`SERVER_VERSION` overrides), and the last backup from `BACKUP_STATUS_FILE` (written by the backup script, #38). The badge is red when the backup failed, and says "No backup yet" when there is none.
- **Dashboard styles are scoped under `.dash`**, so they don't restyle the download page; colours moved to a shared `theme.css`.

## Label printing from the dashboard (#34)

- **The PDF is made in the browser** with `jspdf`. QR codes are drawn as filled squares from `qrcode`'s module grid (error correction M), so they print sharp on any printer.
- **Sheet geometry**: A4 with 3 × 7 labels of 63.5 × 38.1 mm, the common 21-up layout (left margin 7.2 mm, top margin 15.15 mm, column pitch 66.04 mm). The QR is 30 mm. Labels fill across then down; a job longer than the sheet carries on to new pages starting at position 1.
- **Label contents**: an assigned Label shows the QR, the thing's name (bold, up to 4 lines) and the code in small print; a Blank label shows the QR and a large code. The Location isn't printed.
- **New codes are linked before the PDF is made.** "Print Labels for N new things", and Print on a thing with no Label, record `label.attached` as the Dashboard first, so a stuck-on Label always opens its thing. Blank labels are not recorded; they become Labels when a phone attaches them.
- **Codes** are 5 characters from 0–9 and A–Z without I, L, O and U, never one already used (retired ones included).
- **Reprint** prints the same code and records nothing. **Replace** records `label.replaced` (a new code on the same thing; the old one is retired).
- **Print dialog**: a number box and a clickable sheet map. Positions before the start are greyed (already used), and this job's labels are filled.
- **Print entry points** are all on the new Labels page: the list there covers every Asset and Location. The dashboard has no Asset or Location detail page in v1.

## Deployment tooling (#38)

- **One `compose.yaml` for production, with the dev settings in `compose.override.yaml`**: Compose merges the override automatically on the dev PC, and the deploy script copies only `compose.yaml` to the server. The override replaces ports and volumes (`!override`), so dev doesn't also publish port 80.
- **Paths are settings with production defaults** (`DATA_DIR=/srv/inventory`, `BACKUP_USB_DIR=/mnt/inventory-usb`, `HTTP_PORT=80`). This also let the server tooling be tested on the dev PC in a scratch folder.
- **The app image carries the PostgreSQL 17 client** (from the PostgreSQL apt repository; `pg_dump` must be at least the server's version), so backups run inside the app container.
- **The nightly 03:00 backup is a timer in the app**, not host cron: nothing to set up on the server, and it uses the container's `TZ`.
- **The USB copy needs a marker file** (`.inventory-backups`, put there by the setup wizard). Without it the drive is treated as not mounted: the local backup is still made, and the dashboard footer shows "USB drive not mounted" in red.
- **Start**: wait for the database, back up as `start-<version>`, migrate, serve. When migrations change the schema, `backups/migrated-<version>.json` records the backup to roll back to. A failed migration writes `MIGRATION_FAILED` and exits, and later restarts stop straight away instead of looping through backups. Rollback clears it.
- **Restore replaces the whole database** (drop, create, `pg_restore`), so tables a newer version added don't linger. It then sets a new **restore epoch**: every pull carries it, and a phone that sees a new one forgets what it pulled and takes everything again, keeping its Unsent Actions. Without this, phones would keep rows the restored server no longer has, because sequence numbers rewind.
- **Versions**: deploy bumps the patch version (or `--version`) and the Android version code, and sets the same version on the app, the mobile package and the server package (shown in the footer). The server's `.env` keeps `APP_VERSION` and `PREVIOUS_APP_VERSION`. The last two images and APKs are kept.
- **Deploy needs `DEPLOY_HOST`** in the dev PC's `.env` and uses the built-in OpenSSH `ssh`/`scp` (key from the setup wizard). It doesn't commit the version bump; it reminds you to.
