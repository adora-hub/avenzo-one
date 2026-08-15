-- Phase 2.1.R6 advisor follow-up: cover every Product Image foreign key used
-- by archive/delete checks without changing the R6 authorization surface.

create index if not exists product_images_updated_by_idx
  on public.product_images (updated_by);

create index if not exists product_image_commands_actor_user_id_idx
  on public.product_image_commands (actor_user_id);

create index if not exists product_image_events_actor_user_id_idx
  on public.product_image_events (actor_user_id);

create index if not exists product_image_events_image_fk_idx
  on public.product_image_events (organization_id, image_id)
  where image_id is not null;
