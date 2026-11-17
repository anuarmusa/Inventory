# Household Inventory

Tracks everything a single household owns: supplies that get used up and restocked, and long-lived belongings.

## Household

**Household**:
The one home whose inventory this system tracks. There is exactly one, and everyone in it shares the same inventory.
_Avoid_: Account, tenant, organisation

**Device**:
An Android phone that has installed the app and talks to the household's server. A device is recorded when it is paired, not when the app is downloaded. Each device has a name the household gives it, such as "Kitchen phone"; devices are tracked, individual people are not. A removed device can no longer sync until it is paired again.
_Avoid_: User, member, client, download

**Pairing**:
Connecting a newly installed app to the household's server at home, using a one-time code from the download page, so the phone becomes a device the server trusts. Any phone on the home Wi-Fi can be paired.
_Avoid_: Registration, login, sign-up, activation

**Location**:
A named place in the home where things are kept, such as the pantry, freezer, or garage. Locations are a flat list the household defines.
_Avoid_: Room, shelf, bin

## Things

**Supply**:
The general thing the household uses up and restocks, such as jasmine rice or dishwashing liquid, whatever the brand. It is counted in whole units of one kind (pieces, packs, bottles); partly used units are not tracked.
_Avoid_: Consumable, stock item, product

**Batch**:
A quantity of one supply bought together, kept in one location, and sharing one expiry date (or none). When a supply is used, the oldest batch is used first.
_Avoid_: Lot, purchase, stock entry

**Asset**:
A long-lived belonging tracked as one individual thing, such as a TV or a drill, kept for maintenance, moving, or insurance.
_Avoid_: Durable, equipment, possession

**Maintenance entry**:
A dated record of work done on an asset, such as a service or repair, with its cost.
_Avoid_: Service record, maintenance schedule

**Disposed**:
The state of an asset the household no longer has (sold, thrown away, broken), kept in history with its date and reason.
_Avoid_: Deleted, archived, retired

**Category**:
A household-defined grouping shared by supplies and assets, such as Food, Cleaning, or Electronics. Categories are a flat list.
_Avoid_: Type, tag, group

**Barcode**:
The manufacturer's code printed on a product's packaging, identifying one exact product (brand and pack size) that belongs to a supply. Several barcodes can belong to one supply, and each says how many units one scan adds. In-store weighed-item codes are not barcodes in this sense: they never identify a supply.
_Avoid_: QR code, SKU

**Label**:
A QR code the household prints and sticks on an asset or a location to identify it when scanned.
_Avoid_: Tag, sticker, barcode

## Attention

**Low stock**:
A supply whose amount on hand has fallen to its minimum or below. A supply with no minimum is never low stock.
_Avoid_: Out of stock, shortage

**Near expiry**:
A batch whose expiry date falls within the supply's warning window: the household default unless the supply sets its own.
_Avoid_: Expiring, stale

**Alert**:
A notification on a device about a supply that is low stock or a batch that is near expiry.
_Avoid_: Reminder, warning, push

**Shopping list**:
The list of supplies to buy, built from those that are low stock, each with the amount needed to get back to its restock-to level.
_Avoid_: Restock list, order

## Keeping devices in step

**Action**:
One change a device made to the inventory, recorded as what was done, such as using 2 of a supply, adding a batch, or disposing of an asset. Devices record actions while away from home and send them to the server when they return; the server combines the actions from every device.
_Avoid_: Event, edit, transaction, update

**Mismatch**:
A problem found when the server combines actions from several devices, such as a device using more of a supply than was on hand, an action on something already disposed or deleted, or one barcode given to two supplies. The action is applied as far as it can be and the mismatch is kept so someone can check it.
_Avoid_: Conflict, error, sync failure

**Stocktake**:
Counting how much of a supply is really on hand and recording that number. If the count is lower than recorded, the difference comes off the oldest batches first; if higher, the extra becomes a new batch. Uses made before the stocktake are already reflected in the count and are not taken off again.
_Avoid_: Recount, adjustment, inventory check

**Merge**:
Folding one supply into another when the household ends up with two for the same thing, moving its batches and barcodes across.
_Avoid_: Combine, dedupe
