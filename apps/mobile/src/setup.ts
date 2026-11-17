import { DEFAULT_NEAR_EXPIRY_DAYS, isShopWeighedCode, MIN_APP_VERSION } from '@inventory/shared';

/** The scaffold's start screen text: local database state, plus a rule from the shared package. */
export function describeSetup({ migrated, error }: { migrated: boolean; error?: string }): string[] {
  const database = error ? `Local database error: ${error}` : migrated ? 'Local database ready' : 'Preparing local database…';
  return [
    database,
    `Near expiry: ${DEFAULT_NEAR_EXPIRY_DAYS} days by default`,
    `Shop-weighed codes recognised: ${isShopWeighedCode('2100345012504') ? 'yes' : 'no'}`,
    `Minimum app version: ${MIN_APP_VERSION}`,
  ];
}
