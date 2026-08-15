-- Phase 2.1.R6: Product Image Gate.
-- Private, tenant-scoped product images. Storage object bytes are written and
-- removed only through the Storage API; SQL owns reservations and read metadata.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.product_images (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  storage_bucket text not null default 'product-images',
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  alt_text text,
  sort_order smallint not null,
  is_cover boolean not null default false,
  status text not null default 'uploading',
  failure_reason text,
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  archived_at timestamptz,
  constraint product_images_tenant_id_unique unique (organization_id, id),
  constraint product_images_product_tenant_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint product_images_bucket_check check (storage_bucket = 'product-images'),
  constraint product_images_file_name_check check (
    original_file_name = btrim(original_file_name)
    and char_length(original_file_name) between 1 and 180
    and original_file_name !~ '[[:cntrl:]]'
  ),
  constraint product_images_mime_check check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint product_images_size_check check (file_size_bytes between 1 and 5242880),
  constraint product_images_alt_text_check check (
    alt_text is null or (alt_text = btrim(alt_text) and char_length(alt_text) between 1 and 160)
  ),
  constraint product_images_sort_order_check check (sort_order between 1 and 9),
  constraint product_images_status_check check (
    status in ('uploading', 'ready', 'failed', 'archived')
  ),
  constraint product_images_failure_check check (
    (status = 'failed' and failure_reason is not null and char_length(failure_reason) between 1 and 500)
    or (status <> 'failed' and failure_reason is null)
  ),
  constraint product_images_lifecycle_check check (
    (status = 'uploading' and finalized_at is null and archived_at is null and not is_cover)
    or (status = 'ready' and finalized_at is not null and archived_at is null)
    or (status = 'failed' and finalized_at is null and archived_at is null and not is_cover)
    or (status = 'archived' and archived_at is not null and not is_cover)
  ),
  constraint product_images_version_check check (version >= 1),
  constraint product_images_immutable_path_check check (
    storage_path = organization_id::text || '/' || product_id::text || '/' || id::text || '.' ||
      case mime_type
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        when 'image/webp' then 'webp'
      end
  )
);

create unique index product_images_one_cover_unique
  on public.product_images (organization_id, product_id)
  where status = 'ready' and is_cover;
create index product_images_product_read_idx
  on public.product_images (organization_id, product_id, status, sort_order, id);
create index product_images_created_by_idx
  on public.product_images (created_by, status, created_at desc);
create index product_images_updated_by_idx
  on public.product_images (updated_by);

create table public.product_image_commands (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_type text not null,
  payload jsonb not null,
  request_hash text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'processing',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint product_image_commands_tenant_id_unique unique (organization_id, id),
  constraint product_image_commands_type_check check (command_type in (
    'product.image.prepare', 'product.image.finalize', 'product.image.fail',
    'product.image.archive', 'product.images.reorder'
  )),
  constraint product_image_commands_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint product_image_commands_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint product_image_commands_status_check check (status in ('processing', 'completed')),
  constraint product_image_commands_completion_check check (
    (status = 'processing' and result is null and completed_at is null)
    or (status = 'completed' and result is not null and completed_at is not null)
  )
);

create table public.product_image_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_id uuid not null,
  event_name text not null,
  product_id uuid not null,
  image_id uuid,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint product_image_events_command_unique unique (organization_id, command_id),
  constraint product_image_events_command_fk foreign key (organization_id, command_id)
    references public.product_image_commands (organization_id, id) on delete restrict,
  constraint product_image_events_product_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint product_image_events_image_fk foreign key (organization_id, image_id)
    references public.product_images (organization_id, id) on delete restrict,
  constraint product_image_events_name_check check (event_name in (
    'product.image.prepared', 'product.image.finalized', 'product.image.failed',
    'product.image.archived', 'product.images.reordered'
  )),
  constraint product_image_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index product_image_commands_org_time_idx
  on public.product_image_commands (organization_id, created_at desc, id desc);
create index product_image_commands_actor_user_id_idx
  on public.product_image_commands (actor_user_id);
create index product_image_events_product_time_idx
  on public.product_image_events (organization_id, product_id, occurred_at desc, id desc);
create index product_image_events_actor_user_id_idx
  on public.product_image_events (actor_user_id);
create index product_image_events_image_fk_idx
  on public.product_image_events (organization_id, image_id)
  where image_id is not null;

create or replace function private.require_product_image_command_context(
  p_organization_id uuid,
  p_command_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(current_setting('avenzo.product_image_command_id', true), '')::uuid
       is distinct from p_command_id
     or nullif(current_setting('avenzo.product_image_organization_id', true), '')::uuid
       is distinct from p_organization_id then
    raise exception 'product_image_direct_write_forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.guard_product_image_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_command_id uuid := nullif(current_setting('avenzo.product_image_command_id', true), '')::uuid;
begin
  perform private.require_product_image_command_context(
    coalesce(new.organization_id, old.organization_id), v_command_id
  );
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.product_id is distinct from old.product_id
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.original_file_name is distinct from old.original_file_name
       or new.mime_type is distinct from old.mime_type
       or new.file_size_bytes is distinct from old.file_size_bytes
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'product_image_identity_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'archived' then
      raise exception 'archived_product_image_is_immutable' using errcode = '22023';
    end if;
    if (old.status = 'uploading' and new.status not in ('uploading', 'ready', 'failed', 'archived'))
       or (old.status = 'ready' and new.status not in ('ready', 'archived'))
       or (old.status = 'failed' and new.status not in ('failed', 'archived')) then
      raise exception 'invalid_product_image_status_transition' using errcode = '22023';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.guard_product_image_command_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_product_image_command_context(old.organization_id, old.id);
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.command_type is distinct from old.command_type
     or new.payload is distinct from old.payload
     or new.request_hash is distinct from old.request_hash
     or new.actor_user_id is distinct from old.actor_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'product_image_command_is_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.guard_product_image_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_product_image_command_context(new.organization_id, new.command_id);
  return new;
end;
$$;

create or replace function private.prevent_product_image_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '%_is_immutable', tg_table_name using errcode = '22023';
end;
$$;

revoke all on function private.require_product_image_command_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.guard_product_image_write()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_product_image_command_update()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_product_image_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_product_image_history_mutation()
  from public, anon, authenticated, service_role;

create trigger guard_product_image_write
before insert or update on public.product_images
for each row execute function private.guard_product_image_write();
create trigger prevent_product_image_delete
before delete on public.product_images
for each row execute function private.prevent_product_image_history_mutation();
create trigger guard_product_image_command_update
before update on public.product_image_commands
for each row execute function private.guard_product_image_command_update();
create trigger prevent_product_image_command_delete
before delete on public.product_image_commands
for each row execute function private.prevent_product_image_history_mutation();
create trigger guard_product_image_event_insert
before insert on public.product_image_events
for each row execute function private.guard_product_image_event_insert();
create trigger prevent_product_image_event_update_delete
before update or delete on public.product_image_events
for each row execute function private.prevent_product_image_history_mutation();

create or replace function public.server_execute_product_image_command(
  p_command_id uuid,
  p_organization_id uuid,
  p_command_type text,
  p_payload jsonb,
  p_request_hash text,
  p_actor_user_id uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.product_image_commands%rowtype;
  v_image public.product_images%rowtype;
  v_product public.products%rowtype;
  v_object storage.objects%rowtype;
  v_image_id uuid;
  v_product_id uuid;
  v_expected_version bigint;
  v_extension text;
  v_path text;
  v_mime_type text;
  v_file_size bigint;
  v_count integer;
  v_result jsonb;
  v_event_name text;
  v_image_ids uuid[];
  v_cover_image_id uuid;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null then
    raise exception 'product_image_command_identity_required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'product_image_command_payload_invalid' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'product_image_request_hash_invalid' using errcode = '22023';
  end if;
  if p_command_type not in (
    'product.image.prepare', 'product.image.finalize', 'product.image.fail',
    'product.image.archive', 'product.images.reorder'
  ) then
    raise exception 'product_image_command_type_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.manage', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  insert into public.product_image_commands (
    id, organization_id, command_type, payload, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, p_command_type, p_payload, p_request_hash, p_actor_user_id
  ) on conflict (id) do nothing;

  select c.* into strict v_command
  from public.product_image_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.command_type <> p_command_type
     or v_command.payload <> p_payload
     or v_command.request_hash <> p_request_hash
     or v_command.actor_user_id <> p_actor_user_id then
    raise exception 'command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then return v_command.result; end if;

  perform set_config('avenzo.product_image_command_id', p_command_id::text, true);
  perform set_config('avenzo.product_image_organization_id', p_organization_id::text, true);

  if p_command_type = 'product.image.prepare' then
    v_product_id := (p_payload ->> 'product_id')::uuid;
    v_mime_type := p_payload ->> 'mime_type';
    v_file_size := (p_payload ->> 'file_size_bytes')::bigint;
    if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'unsupported_product_image_type' using errcode = '22023';
    end if;
    if v_file_size not between 1 and 5242880 then
      raise exception 'product_image_file_too_large' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(p_payload ->> 'original_file_name', ''))) not between 1 and 180
       or btrim(p_payload ->> 'original_file_name') ~ '[[:cntrl:]]' then
      raise exception 'product_image_file_name_invalid' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_payload ->> 'alt_text', '')), '') is not null
       and char_length(btrim(p_payload ->> 'alt_text')) > 160 then
      raise exception 'product_image_alt_text_invalid' using errcode = '22023';
    end if;

    select p.* into strict v_product
    from public.products p
    where p.organization_id = p_organization_id and p.id = v_product_id
    for update;
    if v_product.status = 'archived' then
      raise exception 'archived_product_is_immutable' using errcode = '22023';
    end if;

    select count(*) into v_count
    from public.product_images i
    where i.organization_id = p_organization_id
      and i.product_id = v_product_id
      and i.status in ('uploading', 'ready');
    if v_count >= 9 then
      raise exception 'product_image_limit_exceeded' using errcode = '22023';
    end if;

    v_image_id := gen_random_uuid();
    v_extension := case v_mime_type
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/webp' then 'webp'
    end;
    v_path := p_organization_id::text || '/' || v_product_id::text || '/' ||
      v_image_id::text || '.' || v_extension;

    insert into public.product_images (
      id, organization_id, product_id, storage_path, original_file_name,
      mime_type, file_size_bytes, alt_text, sort_order, created_by, updated_by
    ) values (
      v_image_id, p_organization_id, v_product_id, v_path,
      btrim(p_payload ->> 'original_file_name'), v_mime_type, v_file_size,
      nullif(btrim(coalesce(p_payload ->> 'alt_text', '')), ''), v_count + 1,
      p_actor_user_id, p_actor_user_id
    ) returning * into v_image;

    v_event_name := 'product.image.prepared';
    v_result := jsonb_build_object(
      'entity_id', v_image.id, 'entity_type', 'product_image',
      'product_id', v_image.product_id, 'status', v_image.status,
      'version', v_image.version, 'storage_bucket', v_image.storage_bucket,
      'storage_path', v_image.storage_path, 'sort_order', v_image.sort_order,
      'upload_contract', jsonb_build_object(
        'upsert', false, 'cache_control', '31536000', 'max_bytes', 5242880,
        'allowed_mime_types', jsonb_build_array('image/jpeg', 'image/png', 'image/webp')
      )
    );

  elsif p_command_type = 'product.image.finalize' then
    v_image_id := (p_payload ->> 'image_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    select i.* into strict v_image
    from public.product_images i
    where i.organization_id = p_organization_id and i.id = v_image_id
    for update;
    if v_image.status = 'ready' then
      v_result := jsonb_build_object(
        'entity_id', v_image.id, 'entity_type', 'product_image',
        'product_id', v_image.product_id, 'status', v_image.status,
        'version', v_image.version, 'sort_order', v_image.sort_order,
        'is_cover', v_image.is_cover
      );
      v_event_name := 'product.image.finalized';
    else
      if v_image.status <> 'uploading' then
        raise exception 'product_image_not_uploading' using errcode = '22023';
      end if;
      if v_image.version <> v_expected_version then
        raise exception 'version_conflict' using errcode = '40001';
      end if;
      select o.* into v_object
      from storage.objects o
      where o.bucket_id = v_image.storage_bucket and o.name = v_image.storage_path;
      if not found then raise exception 'product_image_object_missing' using errcode = '22023'; end if;
      if coalesce(v_object.metadata ->> 'mimetype', '') <> v_image.mime_type then
        raise exception 'product_image_mime_mismatch' using errcode = '22023';
      end if;
      if coalesce((v_object.metadata ->> 'size')::bigint, 0) <> v_image.file_size_bytes then
        raise exception 'product_image_size_mismatch' using errcode = '22023';
      end if;

      select not exists (
        select 1 from public.product_images i
        where i.organization_id = p_organization_id
          and i.product_id = v_image.product_id
          and i.status = 'ready'
      ) into v_image.is_cover;
      update public.product_images set
        status = 'ready', is_cover = v_image.is_cover, finalized_at = now(),
        updated_by = p_actor_user_id
      where organization_id = p_organization_id and id = v_image.id
      returning * into v_image;
      v_event_name := 'product.image.finalized';
      v_result := jsonb_build_object(
        'entity_id', v_image.id, 'entity_type', 'product_image',
        'product_id', v_image.product_id, 'status', v_image.status,
        'version', v_image.version, 'sort_order', v_image.sort_order,
        'is_cover', v_image.is_cover
      );
    end if;

  elsif p_command_type = 'product.image.fail' then
    v_image_id := (p_payload ->> 'image_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    if char_length(btrim(coalesce(p_payload ->> 'failure_reason', ''))) not between 1 and 500 then
      raise exception 'product_image_failure_reason_invalid' using errcode = '22023';
    end if;
    select i.* into strict v_image
    from public.product_images i
    where i.organization_id = p_organization_id and i.id = v_image_id
    for update;
    if v_image.version <> v_expected_version then
      raise exception 'version_conflict' using errcode = '40001';
    end if;
    if v_image.status <> 'uploading' then
      raise exception 'product_image_not_uploading' using errcode = '22023';
    end if;
    if exists (
      select 1 from storage.objects o
      where o.bucket_id = v_image.storage_bucket and o.name = v_image.storage_path
    ) then
      raise exception 'product_image_object_cleanup_required' using errcode = '22023';
    end if;
    update public.product_images set
      status = 'failed', failure_reason = btrim(p_payload ->> 'failure_reason'),
      updated_by = p_actor_user_id
    where organization_id = p_organization_id and id = v_image.id
    returning * into v_image;
    v_event_name := 'product.image.failed';
    v_result := jsonb_build_object(
      'entity_id', v_image.id, 'entity_type', 'product_image',
      'product_id', v_image.product_id, 'status', v_image.status, 'version', v_image.version
    );

  elsif p_command_type = 'product.image.archive' then
    v_image_id := (p_payload ->> 'image_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    select i.* into strict v_image
    from public.product_images i
    where i.organization_id = p_organization_id and i.id = v_image_id
    for update;
    if v_image.version <> v_expected_version then
      raise exception 'version_conflict' using errcode = '40001';
    end if;
    if v_image.status = 'archived' then
      raise exception 'archived_product_image_is_immutable' using errcode = '22023';
    end if;
    if exists (
      select 1 from storage.objects o
      where o.bucket_id = v_image.storage_bucket and o.name = v_image.storage_path
    ) then
      raise exception 'product_image_object_cleanup_required' using errcode = '22023';
    end if;
    update public.product_images set
      status = 'archived', is_cover = false, failure_reason = null,
      archived_at = now(), updated_by = p_actor_user_id
    where organization_id = p_organization_id and id = v_image.id
    returning * into v_image;
    if not exists (
      select 1 from public.product_images i
      where i.organization_id = p_organization_id
        and i.product_id = v_image.product_id and i.status = 'ready' and i.is_cover
    ) then
      update public.product_images set is_cover = true, updated_by = p_actor_user_id
      where id = (
        select i.id from public.product_images i
        where i.organization_id = p_organization_id
          and i.product_id = v_image.product_id and i.status = 'ready'
        order by i.sort_order, i.id limit 1
      );
    end if;
    v_event_name := 'product.image.archived';
    v_result := jsonb_build_object(
      'entity_id', v_image.id, 'entity_type', 'product_image',
      'product_id', v_image.product_id, 'status', v_image.status, 'version', v_image.version
    );

  else
    v_product_id := (p_payload ->> 'product_id')::uuid;
    if jsonb_typeof(p_payload -> 'image_ids') <> 'array'
       or jsonb_array_length(p_payload -> 'image_ids') not between 1 and 9 then
      raise exception 'product_image_order_invalid' using errcode = '22023';
    end if;
    select coalesce(array_agg(value::uuid order by ordinality), '{}'::uuid[])
      into v_image_ids
    from jsonb_array_elements_text(p_payload -> 'image_ids') with ordinality;
    v_cover_image_id := (p_payload ->> 'cover_image_id')::uuid;
    if cardinality(v_image_ids) <> (
      select count(distinct item) from unnest(v_image_ids) item
    ) or not (v_cover_image_id = any(v_image_ids)) then
      raise exception 'product_image_order_invalid' using errcode = '22023';
    end if;
    select p.* into strict v_product
    from public.products p
    where p.organization_id = p_organization_id and p.id = v_product_id
    for update;
    select count(*) into v_count
    from public.product_images i
    where i.organization_id = p_organization_id
      and i.product_id = v_product_id and i.status = 'ready'
      and i.id = any(v_image_ids);
    if v_count <> cardinality(v_image_ids)
       or v_count <> (
         select count(*) from public.product_images i
         where i.organization_id = p_organization_id
           and i.product_id = v_product_id and i.status = 'ready'
       ) then
      raise exception 'product_image_order_invalid' using errcode = '22023';
    end if;
    update public.product_images i set
      sort_order = ordered.position,
      is_cover = i.id = v_cover_image_id,
      updated_by = p_actor_user_id
    from (
      select value::uuid as id, ordinality::smallint as position
      from jsonb_array_elements_text(p_payload -> 'image_ids') with ordinality
    ) ordered
    where i.organization_id = p_organization_id and i.id = ordered.id;
    v_event_name := 'product.images.reordered';
    v_result := jsonb_build_object(
      'entity_id', v_product_id, 'entity_type', 'product',
      'product_id', v_product_id, 'image_count', v_count,
      'cover_image_id', v_cover_image_id
    );
  end if;

  v_product_id := coalesce(v_product_id, v_image.product_id);
  v_image_id := case when p_command_type = 'product.images.reorder' then null else v_image.id end;
  insert into public.product_image_events (
    organization_id, command_id, event_name, product_id, image_id,
    actor_user_id, metadata, occurred_at
  ) values (
    p_organization_id, p_command_id, v_event_name, v_product_id, v_image_id,
    p_actor_user_id, v_result - 'entity_id' - 'entity_type', v_occurred_at
  );

  perform private.append_organization_audit_log(
    p_organization_id, 'product', v_event_name, p_actor_user_id,
    case when v_image_id is null then 'product' else 'product_image' end,
    coalesce(v_image_id, v_product_id), 'product image',
    replace(v_event_name, '.', ' '), v_result - 'entity_id' - 'entity_type',
    'product_image_command', p_command_id, v_event_name, v_occurred_at
  );

  update public.product_image_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;
  perform set_config('avenzo.product_image_command_id', '', true);
  perform set_config('avenzo.product_image_organization_id', '', true);
  return v_result;
exception
  when no_data_found then raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function public.server_execute_product_image_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_execute_product_image_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

alter table public.product_images enable row level security;
alter table public.product_image_commands enable row level security;
alter table public.product_image_events enable row level security;

revoke all privileges on table
  public.product_images, public.product_image_commands, public.product_image_events
from public, anon, authenticated;
grant select on table public.product_images, public.product_image_events to authenticated;
grant select on table public.product_images to service_role;

create policy product_images_read on public.product_images for select to authenticated
using (
  (status = 'ready' or created_by = (select auth.uid()))
  and (select private.has_org_permission(organization_id, 'product.read', null))
);
create policy product_image_events_read on public.product_image_events for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));

create policy "product managers can upload prepared product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.product_images i
    where i.storage_bucket = bucket_id
      and i.storage_path = name
      and i.created_by = (select auth.uid())
      and i.status = 'uploading'
      and (select private.has_org_permission(i.organization_id, 'product.manage', null))
  )
);

create policy "authorized users can read ready product images"
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.product_images i
    where i.storage_bucket = bucket_id
      and i.storage_path = name
      and i.status = 'ready'
      and (select private.has_org_permission(i.organization_id, 'product.read', null))
  )
);

comment on table public.product_images is
  'R6 private product image metadata. 1-9 immutable object paths per Product; file bytes use Storage API.';
comment on function public.server_execute_product_image_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'Trusted idempotent R6 product image lifecycle; service role only. Storage deletes happen before fail/archive.';

notify pgrst, 'reload schema';
