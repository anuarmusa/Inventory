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
