import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-strato.yml', 'utf8');
const moduleMigrations = [
  '20261111222221_create_food_waste_entries.sql',
  '20261111222452_tighten_food_waste_table_grants.sql',
  '20261111223111_harden_food_waste_audit_and_index.sql',
  '20261112155500_create_menu_profitability_private_data.sql',
  '20261112155729_allow_manager_updates_menu_profitability_data.sql',
  '20261112163255_add_atomic_menu_profitability_manager_save.sql',
  '20261112174321_correct_food_waste_comment_and_index_menu_profitability_creator.sql'
];

test('production deploy checks migration source files but never connects to or changes live database', () => {
  for (const migration of moduleMigrations) {
    assert.ok(existsSync(`supabase/migrations/${migration}`), `missing migration source ${migration}`);
    assert.ok(workflow.includes(migration), `production deploy does not verify ${migration}`);
  }
  assert.ok(workflow.includes('Geen verbinding met live DB en geen SQL/migratie wordt uitgevoerd.'));
  assert.ok(!workflow.includes('PRODUCTION_DATABASE_URL'));
  assert.ok(!workflow.includes('PRODUCTION_DATABASE_PASSWORD'));
  assert.ok(!/supabase\\s+db\\s+push(?![^\\n]*--dry-run)/.test(workflow), 'production deploy must not run a mutating db push');
  assert.ok(!workflow.includes('postgres.zimzsovvtdmrthrflkgm'));
  assert.ok(workflow.includes('https://xwjcwravfeldndwlugai.supabase.co'));
});

test('live verification workflow is strictly read-only', () => {
  const dryRun = readFileSync('.github/workflows/preview-production-migrations.yml', 'utf8');
  const commands = dryRun.split(String.fromCharCode(10)).map(line => line.trim()).filter(line => line.startsWith('supabase db push'));
  assert.equal(commands.length, 1, 'only one db push command may exist in the verification workflow');
  assert.match(commands[0], /--dry-run/);
  assert.ok(!dryRun.includes('mirror -R'));
  assert.ok(!dryRun.includes('lftp'));
  assert.ok(dryRun.includes('postgres.xwjcwravfeldndwlugai'));
  assert.ok(dryRun.includes('PRODUCTION_DATABASE_PASSWORD'));
  assert.ok(!dryRun.includes('Connection metadata (no password)'));
});
