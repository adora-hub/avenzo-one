with objects as (
  select
    'tables'::text as category,
    n.nspname || '.' || c.relname || '|' || c.relkind::text || '|' ||
      c.relrowsecurity::text || '|' || c.relforcerowsecurity::text as definition
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p', 'v', 'm')

  union all

  select
    'columns',
    table_schema || '.' || table_name || '|' || ordinal_position::text || '|' ||
      column_name || '|' || data_type || '|' || udt_schema || '.' || udt_name || '|' ||
      is_nullable || '|' || coalesce(column_default, '')
  from information_schema.columns
  where table_schema in ('public', 'private')

  union all

  select
    'constraints',
    n.nspname || '.' || c.relname || '|' || con.conname || '|' ||
      con.contype::text || '|' || pg_get_constraintdef(con.oid, true)
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')

  union all

  select
    'indexes',
    schemaname || '.' || tablename || '|' || indexname || '|' || indexdef
  from pg_catalog.pg_indexes
  where schemaname in ('public', 'private')

  union all

  select
    'policies',
    schemaname || '.' || tablename || '|' || policyname || '|' || permissive || '|' ||
      array_to_string(roles, ',') || '|' || cmd || '|' || coalesce(qual, '') || '|' ||
      coalesce(with_check, '')
  from pg_catalog.pg_policies
  where schemaname in ('public', 'private')

  union all

  select
    'functions',
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' ||
      pg_get_function_result(p.oid) || '|' || p.prokind::text || '|' || p.prosecdef::text || '|' ||
      p.provolatile::text || '|' || replace(pg_get_functiondef(p.oid), E'\r\n', E'\n')
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')

  union all

  select
    'triggers',
    n.nspname || '.' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid, true)
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and not t.tgisinternal
)
select jsonb_object_agg(category, jsonb_build_object('count', object_count, 'md5', fingerprint))
from (
  select
    category,
    count(*) as object_count,
    md5(string_agg(definition, E'\n' order by definition)) as fingerprint
  from objects
  group by category
) fingerprints;
