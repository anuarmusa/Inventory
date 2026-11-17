import migrations from '../../drizzle/migrations';

describe('bundled migrations', () => {
  it('inline every migration’s SQL', () => {
    const sql = Object.values(migrations.migrations as Record<string, string>).join('\n');
    expect(sql).toContain('CREATE TABLE `app_meta`');
    expect(sql).toContain('CREATE TABLE `unsent_actions`');
    expect(migrations.journal.entries).toHaveLength(2);
  });
});
