# Household Inventory

Tracks everything a single household owns: supplies that get used up and restocked, and long-lived belongings.

## Household

**Household**:
The one home whose inventory this system tracks. There is exactly one, and everyone in it shares the same inventory.
_Avoid_: Account, tenant, organisation

**Device**:
A phone that has installed the app and talks to the household's server. A device is recorded when the installed app first connects, not when the app is downloaded. Devices are tracked; individual people are not.
_Avoid_: User, member, client, download

**Location**:
A named place in the home where things are kept, such as the pantry, freezer, or garage. Locations are a flat list the household defines.
_Avoid_: Room, shelf, bin

## Things

**Supply**:
Something the household uses up and restocks, such as rice or detergent. A supply is tracked by how much of it is on hand.
_Avoid_: Consumable, stock item, product

**Batch**:
A quantity of one supply bought together and sharing one expiry date. When a supply is used, the oldest batch is used first.
_Avoid_: Lot, purchase, stock entry

**Asset**:
A long-lived belonging tracked as one individual thing, such as a TV or a drill, kept for maintenance, moving, or insurance.
_Avoid_: Durable, equipment, possession

**Barcode**:
The manufacturer's code printed on a product's packaging, scanned to identify a supply.
_Avoid_: QR code, SKU

**Label**:
A QR code the household prints and sticks on an asset or a location to identify it when scanned.
_Avoid_: Tag, sticker, barcode

## Attention

**Low stock**:
A supply whose amount on hand has fallen to the point where it should be restocked.
_Avoid_: Out of stock, shortage

**Near expiry**:
A batch whose expiry date is close enough that it should be used soon.
_Avoid_: Expiring, stale

**Alert**:
A notification on a device about a supply that is low stock or a batch that is near expiry.
_Avoid_: Reminder, warning, push

**Shopping list**:
The list of supplies to buy, built from those that are low stock.
_Avoid_: Restock list, order
