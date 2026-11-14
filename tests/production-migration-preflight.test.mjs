import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-strato.yml', 'utf8');
const expectedLiveBaseline = [
  '20261107215657 snapshot_legacy_public_data_before_recovery_rebuild',
  '20261107215721 snapshot_legacy_database_object_definitions',
  '20261107215940 archive_legacy_haccp_tables_before_saas_recovery_rebuild',
  '20261107220001 rebuild_saas_core_tables_in_recovery_environment',
  '20261107220027 restore_saas_indexes_rls_and_core_access_helpers',
  '20261107220100 restore_saas_account_and_app_data_rpc_functions',
  '20261107220126 restore_onboarding_and_website_rpc_functions',
  '20261107220143 restore_platform_dashboard_billing_and_onboarding_rpcs',
  '20261107220204 restore_complete_onboarding_activation_rpc',
  '20261107220214 restore_business_default_app_state_trigger',
  '20261107220302 add_legacy_onboarding_activation_rpc_compatibility',
  '20261107220329 harden_recovery_rpc_grants_and_archive_legacy_functions',
  '20261107220741 restore_private_onboarding_storage_buckets_and_policies',
  '20261107220809 harden_archived_haccp_seed_function_search_path',
  '20261107220934 align_website_visit_identity_with_production',
  '20261107221010 sync_exact_live_onboarding_activation_functions',
  '20261107221015 sync_exact_live_rpc_functions_batch_1',
  '20261107221018 sync_exact_live_rpc_functions_batch_2',
  '20261107221020 sync_exact_live_rpc_functions_batch_3',
  '20261107221023 sync_exact_live_rpc_functions_batch_4',
  '20261107221027 sync_exact_live_onboarding_rpc_functions_final_batch',
  '20261107221035 sync_exact_private_business_access_function'
];
const moduleVersions = [
  '20261111222221', '20261111222452', '20261111223111',
  '20261112155500', '20261112155729', '20261112163255',
  '20261112174321'
];

function manifests() {
  return [...workflow.matchAll(/done <<'REMOTE_MIGRATIONS'\n([\s\S]*?)\n\s*REMOTE_MIGRATIONS/g)]
    .map(match => match[1].trim().split('\n').map(line => line.trim()).filter(Boolean));
}

test('production preflight matches the actual 22-migration live recovery history', () => {
  const found = manifests();
  assert.equal(found.length, 2, 'both preflight and placeholder loops must use an explicit manifest');
  assert.deepEqual(found[0], expectedLiveBaseline);
  assert.deepEqual(found[1], expectedLiveBaseline);
  assert.equal(new Set(found[0].map(line => line.split(' ')[0])).size, 22);
});

test('production release remains isolated to the seven verified ANIMO module migrations', () => {
  for (const version of moduleVersions) {
    assert.ok(workflow.includes(`/${version}_`), `missing module migration ${version}`);
  }
  assert.ok(workflow.includes('postgres.xwjcwravfeldndwlugai'));
  assert.ok(workflow.includes('https://xwjcwravfeldndwlugai.supabase.co'));
  assert.ok(workflow.includes('supabase db push --dry-run'));
  assert.ok(workflow.includes('supabase db push --yes'));
  assert.ok(!workflow.includes('20261106001055'));
  assert.ok(!workflow.includes('20261108150151'));
  assert.ok(!workflow.includes('postgres.zimzsovvtdmrthrflkgm'));
});

test('live verification workflow is strictly read-only', () => {
  const dryRun = readFileSync('.github/workflows/preview-production-migrations.yml', 'utf8');
  const commands = [...dryRun.matchAll(/supabase db push[^\\n]*/g)].map(match => match[0]);
  assert.equal(commands.length, 1, 'only one db push command may exist in the verification workflow');
  assert.match(commands[0], /--dry-run/);
  assert.ok(!dryRun.includes('mirror -R'));
  assert.ok(!dryRun.includes('lftp'));
  assert.ok(dryRun.includes('postgres.xwjcwravfeldndwlugai'));
  assert.ok(dryRun.includes('PRODUCTION_DATABASE_PASSWORD'));
});
