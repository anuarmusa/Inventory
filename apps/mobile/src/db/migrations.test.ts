import migrations from '../../drizzle/migrations';

describe('bundled migrations', () => {
  it('inline the first migration’s SQL', () => {
    const sql = Object.values(migrations.migrations as Record<string, string>).join('\n');
    expect(sql).toContain('CREATE TABLE `app_meta`');
    expect(migrations.journal.entries).toHaveLength(1);
  });
});
