#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { getStorage } from '../src/storage/index.js';
import { loadManifest, saveManifest } from '../src/services/manifest-store.js';
import { sanitizeTenantId } from '../src/file-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function usage() {
  console.log(`Usage: node scripts/migrate-persona-storage.js [--dry-run]

Options:
  --tenant <tenantId>     Only migrate data for the specified tenant
  --persona <personaId>   Only migrate data for the specified persona
  --dry-run               Show actions without writing changes
`);
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    tenant: null,
    persona: null
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--tenant') {
      args.tenant = argv[++i];
    } else if (arg === '--persona') {
      args.persona = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      console.warn(`Unknown argument: ${arg}`);
      usage();
      process.exit(1);
    }
  }

  return args;
}

function listManifests(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(dir, file));
}

async function migrateManifest(storage, tenantId, personaId, { dryRun }) {
  const manifest = await loadManifest(tenantId, personaId).catch(() => null);
  if (!manifest) {
    console.log(`- No manifest for tenant=${tenantId}, persona=${personaId || 'default'}`);
    return;
  }

  const updatedFiles = manifest.files?.map(file => ({
    ...file,
    persona: file.persona || personaId || null
  })) || [];

  if (dryRun) {
    console.log(`DRY RUN: Would save manifest for tenant=${tenantId}, persona=${personaId || 'default'} with ${updatedFiles.length} file(s)`);
    return;
  }

  await saveManifest(tenantId, { ...manifest, files: updatedFiles, persona: personaId || null }, personaId);
  console.log(`✔ Updated manifest for tenant=${tenantId}, persona=${personaId || 'default'}`);
}

async function migrateTenant({ tenantId, personaId, dryRun }) {
  const storage = getStorage();
  if (!tenantId) {
    throw new Error('tenantId is required for migration');
  }

  const safeTenant = sanitizeTenantId(tenantId) || 'default';
  const baseDir = path.join(PROJECT_ROOT, 'uploads', 'processed', safeTenant);
  if (!fs.existsSync(baseDir)) {
    console.log(`- No processed directory for tenant ${tenantId}`);
  }

  const personaDirs = fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [];

  if (personaId) {
    await migrateManifest(storage, tenantId, personaId, { dryRun });
  } else if (personaDirs.length > 0) {
    for (const persona of personaDirs) {
      if (!fs.statSync(path.join(baseDir, persona)).isDirectory()) continue;
      await migrateManifest(storage, tenantId, persona, { dryRun });
    }
  } else {
    await migrateManifest(storage, tenantId, null, { dryRun });
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const tenants = args.tenant
    ? [args.tenant]
    : fs.existsSync(path.join(PROJECT_ROOT, 'uploads', 'processed'))
      ? fs.readdirSync(path.join(PROJECT_ROOT, 'uploads', 'processed'))
          .filter(item => fs.statSync(path.join(PROJECT_ROOT, 'uploads', 'processed', item)).isDirectory())
      : [];

  if (tenants.length === 0) {
    console.log('No tenants found to migrate. Exiting.');
    return;
  }

  for (const tenantDir of tenants) {
    const tenantId = args.tenant || tenantDir;
    await migrateTenant({ tenantId, personaId: args.persona, dryRun: args.dryRun });
  }

  console.log('Migration complete.');
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});

