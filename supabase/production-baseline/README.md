# Supabase Production Migration Baseline

This directory is a read-only recovery archive captured from
`supabase_migrations.schema_migrations` in Supabase Production project
`eigrllibviqjddenjuch` on 2026-08-13.

## Safety boundary

- These files are evidence, not forward migrations.
- Do not copy them into `supabase/migrations` or apply them to Production.
- Do not edit an archived SQL file. Capture a new evidence set and review the diff instead.
- Production migration history remains unchanged.
- No Product, SKU, Warehouse, Location, or Inventory schema is included by Phase 2.0.3.1.

## Verification

Run from the repository root:

```powershell
node supabase/production-baseline/verify.mjs
```

The validator checks all 90 SQL files against `manifest.json`. Hashes use the
same canonicalization as the read-only Production query: CRLF becomes LF and
trailing LF characters are removed before MD5.

A clean replay and schema diff still require an isolated database runtime.
They must never be performed against Production. The verified local workflow is:

```powershell
cd web
npm run supabase -- start --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File supabase/production-baseline/replay-local.ps1
```

The replay harness applies 90 canonical migrations plus the seven entries pinned
in `bridges/manifest.json`. `schema-fingerprint.sql` matched Production across
tables, columns, constraints, indexes, policies, functions, and triggers on
2026-08-13.
