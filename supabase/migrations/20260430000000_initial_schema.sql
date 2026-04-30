create table if not exists public.merch_items (
  id text primary key,
  slug text not null unique,
  name text not null,
  image text not null,
  tag text not null,
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  price_crc text not null,
  min_price_crc text not null,
  max_price_crc text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint merch_items_price_crc_check check (price_crc ~ '^[0-9]+(\.[0-9]{1,4})?$'),
  constraint merch_items_min_price_crc_check check (min_price_crc ~ '^[0-9]+(\.[0-9]{1,4})?$'),
  constraint merch_items_max_price_crc_check check (max_price_crc ~ '^[0-9]+(\.[0-9]{1,4})?$'),
  constraint merch_items_price_range_check check (
    min_price_crc::numeric > 0
    and price_crc::numeric > 0
    and max_price_crc::numeric > 0
    and min_price_crc::numeric <= price_crc::numeric
    and price_crc::numeric <= max_price_crc::numeric
  ),
  constraint merch_items_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint merch_items_image_check check (
    (image like '/%' and image not like '//%')
    or image like 'https://%'
  )
);

create table if not exists public.purchases (
  purchase_id text primary key,
  reference text not null unique,
  merch_item_id text not null,
  merch_name text not null,
  ticket text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  payer_address text,
  payer_display_name text,
  payment_tx_hash text,
  payment_detected_at timestamptz,
  payment_status text not null default 'awaiting_payment',
  outcome_status text not null default 'pending',
  payout_status text not null default 'none',
  verification_status text not null default 'pending',
  verified_amount_crc text,
  verified_amount_atto_crc text,
  payout_tx_hash text,
  status_message text not null default 'Waiting for an incoming CRC transfer.',
  last_verified_at timestamptz,
  constraint purchases_payment_status_check check (payment_status in ('initiated', 'awaiting_payment', 'paid', 'expired', 'failed', 'cancelled')),
  constraint purchases_outcome_status_check check (outcome_status in ('pending', 'won', 'lost')),
  constraint purchases_payout_status_check check (payout_status in ('none', 'queued', 'processing', 'refunded', 'failed')),
  constraint purchases_verification_status_check check (verification_status in ('pending', 'valid', 'invalid', 'duplicate')),
  constraint purchases_payment_tx_hash_check check (payment_tx_hash is null or payment_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  constraint purchases_payout_tx_hash_check check (payout_tx_hash is null or payout_tx_hash ~ '^0x[a-fA-F0-9]{64}$')
);

create table if not exists public.payout_records (
  purchase_id text primary key references public.purchases (purchase_id) on delete cascade,
  status text not null check (status in ('none', 'queued', 'processing', 'refunded', 'failed')),
  tx_hash text,
  error_message text,
  updated_at timestamptz not null,
  constraint payout_records_tx_hash_check check (tx_hash is null or tx_hash ~ '^0x[a-fA-F0-9]{64}$')
);

create table if not exists public.purchase_archives (
  purchase_id text primary key,
  reference text not null,
  merch_item_id text not null,
  merch_name text not null,
  ticket text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  payer_address text,
  payer_display_name text,
  payment_tx_hash text,
  payment_detected_at timestamptz,
  payment_status text not null,
  outcome_status text not null,
  payout_status text not null,
  verification_status text not null,
  verified_amount_crc text,
  verified_amount_atto_crc text,
  payout_tx_hash text,
  status_message text not null,
  last_verified_at timestamptz,
  archived_at timestamptz not null default timezone('utc', now())
);

create index if not exists merch_items_display_order_idx on public.merch_items (display_order asc, name asc);
create index if not exists purchases_created_at_idx on public.purchases (created_at desc);
create index if not exists purchases_active_created_at_idx
  on public.purchases (created_at desc)
  where payment_status = 'awaiting_payment' or payout_status in ('queued', 'processing', 'failed');
create index if not exists purchases_outcome_status_idx on public.purchases (outcome_status);
create index if not exists purchase_archives_created_at_idx on public.purchase_archives (created_at desc);
create index if not exists purchase_archives_archived_at_idx on public.purchase_archives (archived_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists merch_items_set_updated_at on public.merch_items;
create trigger merch_items_set_updated_at
before update on public.merch_items
for each row
execute function public.set_updated_at();

alter table public.merch_items enable row level security;
alter table public.purchases enable row level security;
alter table public.payout_records enable row level security;
alter table public.purchase_archives enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-images', 'merch-images', true, 10485760, array['image/*'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
