# Database Migrations

This directory contains versioned SQL migrations for the RD dashboard database.

Run migrations with:

```bash
npm run db:migrate
```

Check migration status with:

```bash
npm run db:migrate:status
```

The migration runner uses `SUDA_DATABASE_URL` and records applied files in
`rd_schema_migrations`. New migration filenames should use this format:

```text
YYYYMMDDHHMMSS_short_description.sql
```

Current service startup still keeps the legacy idempotent `ensure*` table checks
for compatibility. New schema changes should be added here first, then the
legacy startup DDL can be retired incrementally after environments are migrated.
