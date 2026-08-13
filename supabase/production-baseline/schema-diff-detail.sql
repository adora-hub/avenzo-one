select jsonb_build_object(
  'functions', (
    select jsonb_agg(
      jsonb_build_object(
        'key', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        'md5', md5(replace(pg_get_functiondef(p.oid), E'\r\n', E'\n'))
      )
      order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    )
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
  ),
  'policies', (
    select jsonb_agg(
      jsonb_build_object(
        'key', schemaname || '.' || tablename || '.' || policyname,
        'definition', permissive || '|' || array_to_string(roles, ',') || '|' || cmd || '|' ||
          coalesce(qual, '') || '|' || coalesce(with_check, '')
      )
      order by schemaname, tablename, policyname
    )
    from pg_catalog.pg_policies
    where schemaname in ('public', 'private')
  )
);
