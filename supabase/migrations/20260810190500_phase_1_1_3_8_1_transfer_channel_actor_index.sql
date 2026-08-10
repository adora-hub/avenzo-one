-- Phase 1.1.3.8.1 advisor hardening: cover the immutable creator foreign key.
create index billing_transfer_channel_created_by_idx
on public.billing_transfer_channels (created_by);
