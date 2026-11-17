import migrations from '../drizzle/migrations';
import { describeSetup } from './setup';

describe('describeSetup', () => {
  it('uses rules from the shared package', () => {
    const lines = describeSetup({ migrated: true });
    expect(lines).toContain('Local database ready');
    expect(lines).toContain('Near expiry: 7 days by default');
    expect(lines).toContain('Shop-weighed codes recognised: yes');
  });

  it('shows a migration error', () => {
    expect(describeSetup({ migrated: false, error: 'disk full' })[0]).toBe('Local database error: disk full');
  });
});

describe('bundled migrations', () => {
  it('inline the first migration’s SQL', () => {
    const sql = Object.values(migrations.migrations as Record<string, string>).join('\n');
    expect(sql).toContain('CREATE TABLE `app_meta`');
    expect(migrations.journal.entries).toHaveLength(1);
  });
});
