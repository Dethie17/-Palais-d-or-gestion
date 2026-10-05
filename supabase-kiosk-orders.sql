-- --------------------------------------------------------
-- Kiosk orders table: récréation & pause purchases paid by prepaid card
-- --------------------------------------------------------

create table if not exists public.kiosk_orders (
  id uuid default gen_random_uuid() primary key,
  child_id text not null,
  parent_username text not null,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','served','cancelled')),
  reference text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  served_at timestamp with time zone
);

comment on table public.kiosk_orders is 'Commandes kiosque récréation/pause payées par la carte prépayée de l\'enfant';

-- Index for quick lookup by child/date
create index if not exists kiosk_orders_child_idx on public.kiosk_orders (child_id);
create index if not exists kiosk_orders_created_idx on public.kiosk_orders (created_at desc);
create index if not exists kiosk_orders_status_idx on public.kiosk_orders (status);

-- RLS policies (open for now, can be tightened per establishment)
allow all on public.kiosk_orders;