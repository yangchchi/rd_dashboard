#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const postgres = require('postgres');

const root = process.cwd();
const migrationsDir = path.join(root, 'server', 'database', 'migrations');
const statusOnly = process.argv.includes('--status');

function migrationIdFromFile(fileName) {
  return fileName.replace(/\.sql$/i, '');
}

async function listMigrationFiles() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true }).catch((error) => {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile() && /^\d{14}_[a-z0-9_ -]+\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function ensureMigrationTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS rd_schema_migrations (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

function checksum(content) {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function appliedMigrationMap(sql) {
  const rows = await sql`
    SELECT id, file_name, checksum, applied_at
    FROM rd_schema_migrations
    ORDER BY id ASC;
  `;
  return new Map(rows.map((row) => [row.id, row]));
}

async function printStatus(files, applied) {
  if (files.length === 0) {
    console.log('[db:migrate] No migration files found.');
    return;
  }
  for (const fileName of files) {
    const id = migrationIdFromFile(fileName);
    const row = applied.get(id);
    console.log(`${row ? 'APPLIED ' : 'PENDING '} ${id} ${fileName}`);
  }
}

async function run() {
  const url = process.env.SUDA_DATABASE_URL;
  if (!url) {
    throw new Error('SUDA_DATABASE_URL is required to run database migrations');
  }

  const sql = postgres(url, { max: 1 });
  try {
    await ensureMigrationTable(sql);
    const files = await listMigrationFiles();
    const applied = await appliedMigrationMap(sql);

    if (statusOnly) {
      await printStatus(files, applied);
      return;
    }

    let appliedCount = 0;
    for (const fileName of files) {
      const id = migrationIdFromFile(fileName);
      if (applied.has(id)) continue;

      const absolutePath = path.join(migrationsDir, fileName);
      const content = await fs.readFile(absolutePath, 'utf8');
      const hash = checksum(content);
      console.log(`[db:migrate] Applying ${fileName}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`
          INSERT INTO rd_schema_migrations (id, file_name, checksum)
          VALUES (${id}, ${fileName}, ${hash});
        `;
      });
      appliedCount += 1;
    }

    if (appliedCount === 0) {
      console.log('[db:migrate] Database is already up to date.');
    } else {
      console.log(`[db:migrate] Applied ${appliedCount} migration(s).`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migrate] ${message}`);
  process.exit(1);
});
