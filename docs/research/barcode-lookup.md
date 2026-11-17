# Can scanned barcodes fill in product names automatically?

Research for [#5](https://github.com/anuarmusa/Inventory/issues/5). Researched 2026-11-17.

**Question.** When a Supply's Barcode (EAN-13 / UPC-A) is scanned for the first time on a phone, can product name, brand, size and image be prefilled? Lookups away from home must go phone to internet service over mobile data (the home server is only reachable on home Wi-Fi), and the app must still work fully offline. Products are groceries and household goods bought in Malaysia.

**Short answer.** Partly, and only online. Open Food Facts is the only free, keyless service with measurable Malaysian coverage: about 4,900 products with Malaysia's 955 GS1 prefix, and about 2,950 tagged as sold in Malaysia. Records are often incomplete. In a sample of 500 Malaysian-prefix products, 88% had a name and 77% a front image, but only 27% had name, brand, size and image together. The commercial US-centric databases found almost nothing in a spot check. Malaysian non-food household goods are barely covered anywhere. The household's own past scans will usually be the most reliable source after the first purchase, and they are the only source that works offline.

---

## 1. Background facts that shape any lookup

- **955 is Malaysia's GS1 prefix, but it is not a country of origin.** GS1's prefix table assigns 955 to GS1 Malaysia ([GS1 Company Prefix](https://www.gs1.org/standards/id-keys/company-prefix)). GS1 also says prefixes "do not identify the country of origin" of a product (same page). Imported goods on Malaysian shelves carry other prefixes. For example, Open Food Facts has 1,182 products tagged as sold in Malaysia that do not start with 955 (query in §2.1). So "955 coverage" understates what a Malaysian household actually scans.
- **GS1 Malaysia is the only authorised issuer of 955 numbers**, and it withdraws prefixes from lapsed members ([GS1 Malaysia](https://gs1my.org/), [Withdrawal of the GS1 Company Prefix](http://www.gs1my.org/?q=withdrawal-gs1-company-prefix)). A reassigned prefix means an old barcode could later identify a different product. That is rare, but it argues against treating any external answer as permanent truth.
- **In-store barcodes cannot be looked up anywhere.** Numbers with prefixes 02 and 20–29 are Restricted Circulation Numbers. They are "NOT GTINs and are not globally unique", and their structure, often with weight or price embedded, varies by market ([GS1 Summary of Prefixes 20–29](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf), [GS1 Fresh Foods at POS guideline](https://ref.gs1.org/guidelines/fresh-foods/)). Supermarket-weighed meat, produce and bakery items fall here. The app should recognise these prefixes and skip the internet lookup.
- **UPC-A and EAN-13 are the same number space.** A 12-digit UPC-A equals a 13-digit GTIN with a leading zero ([GS1 General Specifications](https://ref.gs1.org/standards/genspecs/)). Storing a normalised form avoids duplicate supplies for the same product.

## 2. Services surveyed

### 2.1 Open Food Facts (OFF), plus Open Products Facts and Open Beauty Facts

**Access and limits** (from the [OFF API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)):
- Reads need **no API key and no account**, only a custom `User-Agent` of the form `AppName/Version (ContactEmail)`.
- Product reads are limited to **15 req/min per IP** and search to **10 req/min per IP**. Exceeding them can get the IP banned. Separate global limits return HTTP 503.
- "If your requests come from your users directly (ex: mobile app), the rate limits apply per user." Calling straight from the phone is therefore the expected pattern for mobile apps. A household scanning a cart is far below 15 lookups a minute.
- Read endpoint: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}?fields=product_name,brands,quantity,image_front_url` ([API tutorial](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/)). A live call for Maggi Ketchup `9556001600806` returned name "Maggi Ketchup tomato 475g", brand, quantity "475g" and a front image. An unknown code returned `{"status":0,"status_verbose":"product not found"}` (tested 2026-11-17).
- **Reliability:** during this research `world.openfoodfacts.org` returned "Page temporarily unavailable" (HTTP 503) for search and facet pages, while single-product reads worked. The app should treat OFF as best-effort with a short timeout.
- **Writes**, such as adding a missing product, need an OFF account ([API tutorial](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/)). Contributing back is optional.
- **Bulk data:** nightly full exports are available as a MongoDB dump, JSONL, Parquet and CSV (food CSV ~0.9 GB compressed / ~9 GB uncompressed), plus 14-day daily deltas ([OFF data page](https://world.openfoodfacts.org/data)). The home server could therefore keep a local Malaysia subset, though the phone still cannot reach it away from home.

**Malaysian coverage.** Counts come from the OFF search service (`search.openfoodfacts.org`, Elasticsearch-backed), queried 2026-11-17, exact counts:

| Query | Products |
|---|---|
| `code:955*` (GS1 Malaysia prefix) | 4,889 |
| `countries_tags:"en:malaysia"` (sold in Malaysia) | 2,955 |
| sold in Malaysia but not 955 prefix | 1,182 |
| for comparison: sold in Singapore / Thailand | 6,172 / 7,448 |

Field completeness was measured on a sample of 500 `code:955*` products (5 result pages of 100, default ordering, so not a random sample):

| Field present | Share |
|---|---|
| product name | 88% |
| front image | 77% |
| brand | 51% |
| quantity (size) | 44% |
| name **and** image | 68% |
| name, brand, size **and** image | 27% |

Some names are in French or other languages, e.g. "Chip's d'algues et quinoa" or "L'huile de palme" for Malaysian-prefix products. Contributors write in their own language, so prefilled names may need editing.

**Non-food sister databases.** Open Products Facts (household goods) and Open Beauty Facts (toiletries, cosmetics) use the same API style on their own hosts. Both are very thin for Malaysia: **108** and **178** products tagged as sold in Malaysia respectively (`/api/v2/search?countries_tags_en=malaysia` on `world.openproductsfacts.org` and `world.openbeautyfacts.org`, 2026-11-17). Detergent, tissue and similar household goods will mostly miss.

**Licence** ([OFF terms of use](https://world.openfoodfacts.org/terms-of-use)):
- The database is under the **ODbL**, individual contents under the **DbCL**, and product images under **CC BY-SA**. Images may contain third-party trademarks or designs that the licence does not cover.
- Re-users must "mention the licence and … attribute the authorship to Open Food Facts" with a link. The OFF data page asks apps to attribute clearly in their UI, with links to OFF and the ODbL ([OFF data page](https://world.openfoodfacts.org/data)).
- ODbL obligations, from the [ODbL 1.0 text](https://opendatacommons.org/licenses/odbl/1-0/) and [summary](https://opendatacommons.org/licenses/odbl/summary/):
  - Attribution applies to **public** use.
  - Share-alike applies when a Derivative Database, or a work produced from one, is **used publicly**.
  - "Publicly" means "to Persons other than You or under Your control…".
- **Implication for caching on the home server.** Copying looked-up OFF records into the household's database creates a derivative or collective database. Used only inside the household, it is not plausibly "public", so share-alike should not be triggered. Showing a small "Product data from Open Food Facts (ODbL)" credit on prefilled items is cheap insurance and matches OFF's request. If the project were ever published as a shared service or with a bundled product database, the share-alike obligations would apply. This is a reading of the licence, not legal advice.

### 2.2 UPCitemdb

- **Free "EXPLORER" / trial tier:** no sign-up and no key. Use `https://api.upcitemdb.com/prod/trial/lookup?upc=…` ([Getting started](https://www.upcitemdb.com/wp/docs/main/development/getting-started/)).
- **Free limits:** 100 requests per day, of which 20 can be searches. Bursts are capped at 6 lookups per minute, with a sustainable rate of 1 request per 10 s. Limits are **per IP** ([Plan comparison](https://www.upcitemdb.com/wp/docs/main/development/plan/), [API rate limits](https://www.upcitemdb.com/wp/docs/main/development/api-rate-limits/)). "The plan FREE provides the same full database access as paid plans" ([Plan comparison](https://www.upcitemdb.com/wp/docs/main/development/plan/)).
- **Paid tiers:** DEV costs US$99/month for 20,000 lookups a day; PRO costs US$699/month ([devs.upcitemdb.com](https://devs.upcitemdb.com/)). Both are far beyond household need.
- **Terms:** the [terms of service](https://devs.upcitemdb.com/termsofservice) grant a "limited, non-exclusive, non-transferable and terminable license" and say nothing explicit about caching. The free tier needs no key, so calling it from a phone exposes no secret. Paid tiers use a key, which would need to stay on the server.
- **Malaysian coverage (spot check, 2026-11-17):** 12 Malaysian-prefix products that OFF *does* know were looked up on the free trial. Only **2 of 11** answered were found (Goldwilly chrysanthemum drink and Hudson cough drops). Maggi Ketchup, Nata de coco, oats and several snacks were missing, and the 12th hit HTTP 429 at the burst limit. The database is US-oriented.

### 2.3 Barcode Lookup (barcodelookup.com)

- **Paid only:** from US$99/month for 5,000 calls up to US$949/month. A "free test API account" is offered, and a **key is required** ([Barcode Lookup API](https://www.barcodelookup.com/api)).
- **Terms** ([terms and conditions](https://www.barcodelookup.com/terms-and-conditions)):
  - Calls are capped at 100 per minute.
  - The API key is "Login Information" that you must keep confidential, so it should not be embedded in a phone app.
  - On termination "you shall delete all Product Data previously provided to you (including any cached and backed up Product Data)". Cached entries in the household database would have to be purged if the subscription lapsed.
  - The terms grant no rights to third-party content such as images.
- No Malaysian coverage figures are published, and none were tested because no key was available. The price alone rules it out for a household.

### 2.4 GS1: Verified by GS1 and GS1 Malaysia

- **Verified by GS1 (global):**
  - The public web lookup is free but limited to **30 queries per day** ([GS1 support: What is Verified by GS1?](https://support.gs1.org/support/solutions/articles/43000734077-what-is-verified-by-gs1-), [Verified by GS1 Terms of Use 2025](https://www.gs1.org/docs/verified-by-gs1/verified-by-gs1_tou_2025.pdf)). GS1's architecture notes say the cap is per IP to prevent scraping ([GS1 architecture findings](https://ref.gs1.org/architecture/findings/integrity-and-security/)).
  - API access is offered only through national member organisations, to members ([GS1 support](https://support.gs1.org/support/solutions/articles/43000734077-what-is-verified-by-gs1-)). There is **no public API** a household app can call.
  - Its data is authoritative brand-owner data, covering the "seven core attributes": GTIN, brand, product description, image URL, GPC category, net content and countries of sale ([GS1/CGF quick start guide](https://www.gs1.org/sites/default/files/gs1_cgf_quick_start_guide.pdf)). These are exactly the fields wanted, but they are not reachable programmatically.
- **GS1 Malaysia:**
  - It runs a Member Product Databank and a "Verified by GS1 Search Portal" at databank.gs1my.com, plus a "GS1 Databank Mobile App" for consumers ([GS1 Malaysia FAQ](https://www.gs1my.org/faqs)).
  - Listing is only for subscribing members, and products not registered there "will not appear to any consumer who scans the barcode" ([Member Product Databank brochure](https://www.gs1my.org/marketing/GS1%20Information%20Pack/GS1%20Malaysia%20Member%20Product%20Databank%20Brochure.pdf)).
  - No consumer or developer API is documented ([GS1 Malaysia FAQ](https://www.gs1my.org/faqs)). It is useful for a human to check a barcode manually, not as an app integration.
- The gs1.org terms PDF and prefix pages returned HTTP 403 to automated fetches. The query limit is confirmed by the GS1 support article.

### 2.5 EAN-Search.org

- **Paid only.** The trial is 100 queries for €1 in the first month, then €9/month. Paid plans run from €19/month for 5,000 queries to €149/month. The service claims 1.3 billion barcodes ([EAN-Search API page](https://www.ean-search.org/ean-database-api.html)).
- Authentication is a token passed as a query parameter, `https://api.ean-search.org/api?token=…&op=barcode-lookup&ean=…`. This comes from the official client libraries rather than the docs page, which returned 403 ([eansearch on PyPI](https://pypi.org/project/eansearch)). The token would sit in the URL, so it should not ship inside a phone app.
- It returns mainly a name and category, plus an "issuing country" operation. Image and size coverage was not verified, the terms page returned 403, and Malaysian coverage is unknown.

### 2.6 Others found

- **Go-UPC:** US$74.95/month for 5,000 calls and up, with trial keys on request. It claims "over 500-million products" ([Go-UPC API plans](https://go-upc.com/plans/api)). It is paid, keyed and has no Malaysian evidence, so it has the same issues as Barcode Lookup.

## 3. The household's own past scans as the primary source

The glossary defines a Barcode as "the manufacturer's code printed on a product's packaging, scanned to identify a supply" ([GLOSSARY.md](../../GLOSSARY.md)). Once a barcode has been linked to a Supply, the next scan of the same barcode needs no internet lookup:

- **It works offline.** The phone can hold the barcode-to-supply map locally, synced from the home server. The brief requires offline purchase capture ([project-brief.md](../project-brief.md)), and this is the only lookup that satisfies it.
- **It is the most accurate.** It records the household's own naming ("Beras Jasmine 10kg", in whatever language they prefer), not a crowd-sourced name that may be in French.
- **Hit rate grows quickly.** Groceries are bought repeatedly, so after the first few weeks most scans are repeats. This is an inference about typical shopping patterns, not a measured figure.
- **There are no licence issues** for data the household typed itself. OFF-sourced fields copied in carry ODbL/CC BY-SA, so the record should note where they came from (§2.1).
- **Limits:** it never helps on a product's first purchase, and it needs a manual entry path anyway for misses, in-store barcodes (§1) and offline first scans.

The likely lookup order on a scan is therefore:
1. the local household catalogue on the phone;
2. if online and not an in-store number, Open Food Facts, called direct from the phone with a short timeout;
3. a manual entry form, with any partial fields prefilled.

When the phone is offline, the barcode can be queued and the lookup retried later, either by the phone when it regains data or by the home server when the phone syncs.

## 4. Comparison

| Source | Cost | Key / account | Rate limit | Phone-direct OK? | Malaysian coverage evidence | Data licence / caching |
|---|---|---|---|---|---|---|
| Household's own scans | Free | n/a | n/a | Yes, works offline | Grows with use; 100% for repeats | Own data |
| Open Food Facts | Free | None (custom User-Agent) | 15 reads/min per IP or user | Yes, explicitly anticipated for mobile apps | 4,889 with 955 prefix; 2,955 sold-in-MY; 27% complete on all four fields, 68% name+image | ODbL / DbCL / CC BY-SA images; attribution; share-alike only on public use |
| Open Products Facts | Free | None | Same API style | Yes | 108 sold-in-MY | Same as OFF |
| Open Beauty Facts | Free | None | Same API style | Yes | 178 sold-in-MY | Same as OFF |
| UPCitemdb (free) | Free | None | 100/day, 6/min, per IP | Yes (no secret) | 2 of 11 known MY products found | Terminable licence; caching not addressed |
| UPCitemdb (DEV) | US$99/mo | Key | 20k/day | No (key must stay server-side) | Same database as free | Same |
| Barcode Lookup | US$99–949/mo | Key | 100/min | No (key confidential) | Unknown | Must delete all cached data on termination |
| EAN-Search | €9–149/mo | Token in URL | Monthly quota | No (token exposure) | Unknown | Terms not retrievable |
| Go-UPC | US$74.95+/mo | Key | Monthly quota | No | Unknown | Not checked |
| Verified by GS1 | Free web only | n/a | 30/day per IP, web UI | No API | Authoritative but no API | Free use limited to 30 queries/24 h; fuller terms not retrievable |
| GS1 Malaysia Databank | Free web/app (members list products) | n/a | n/a | No API | Only subscribing members' products | n/a |

## 5. Implications for other tickets

**#6, data model (what each Supply records):**
- **Supply versus product.** The glossary defines a Supply as "rice" or "detergent", yet a barcode identifies one specific product, brand and size. Two kinds of record are likely needed:
  - Supply ↔ Barcode should be one-to-many. Several brands or sizes of rice can map to one Supply, with brand, size and image held per barcode rather than per Supply.
  - Otherwise every new brand of rice becomes a new Supply, which fragments low-stock tracking.
  - This is the most consequential finding for #6.
- **Store a normalised GTIN** (UPC-A zero-padded to 13 digits) and flag in-store 02/20–29 numbers. They are not globally unique, may encode weight or price, and should not be used as a stable identifier of a Supply.
- **Keep provenance per field or per record:** entered by hand, or taken from Open Food Facts with a link. This supports the ODbL/CC BY-SA attribution and lets a household edit override the external value.
- **Images:** the OFF image is a URL. Decide whether the server downloads a copy, which works offline but stores a CC BY-SA image, or hot-links to it, which needs data.

**#10, scan flows, and #9, offline sync:**
- First-scan flow: local catalogue first, then OFF lookup if online, then manual form. Expect a prefill on many Malaysian grocery scans, though only about a quarter of them complete on all four fields. Expect mostly misses on household goods and toiletries.
- **Offline first scan:** capture the barcode and a minimal name, then enrich it later. Sync must handle a barcode that two phones each linked to different Supplies while offline.
- The phone needs a synced local copy of the barcode-to-supply map so repeat scans resolve offline.

**#3, phone technology:**
- The phone must make HTTPS calls to a public API over mobile data and set a custom User-Agent. OFF needs no secrets, so nothing sensitive ships in the app.
- Any paid, keyed service would have to be proxied through the home server, which only works on home Wi-Fi.
