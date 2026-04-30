# Circles EthCC shop

Next.js merch checkout for in-person booth sales using CRC. The app creates a signed purchase intent, shows a QR, watches the organization avatar's on-chain transaction history, and can trigger real CRC refunds from a server-only treasury signer.


## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and set real values:

```bash
cp .env.example .env.local
```

3. Required values:

- `CIRCLES_ORG_ADDRESS`: public receiving avatar address
- `CIRCLES_TREASURY_PRIVATE_KEY`: backend-only signer for refund execution
- `PURCHASE_SIGNING_SECRET`: HMAC secret for stateless purchase tickets
- `ADMIN_USERNAME` and `ADMIN_PASSWORD`: Basic auth for `/admin`
- `INTERNAL_API_TOKEN`: token for protected internal endpoints such as `/api/payment/reconcile`
- `SUPABASE_URL`: project URL from Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key used for backend persistence
- `SUPABASE_DB_URL`: Postgres connection string used only for setup/migrations

Optional:

- `CIRCLES_WSS_LISTENER_ENABLED`: set to `false` to disable the live Circles WebSocket watcher. When unset, local loopback HTTP RPC URLs such as Anvil/fork proxies are auto-disabled and can still use manual verification or reconcile polling.

4. Create the required tables in Supabase on a fresh database:

Set `SUPABASE_DB_URL` to the Supabase pooler or direct Postgres connection string, then run:

```bash
npm run setup:supabase
```

The setup command applies `supabase/migrations/20260430000000_initial_schema.sql`.
It also configures the public `merch-images` Storage bucket for admin image uploads with a 10MB file-size limit.

You can also paste the migration SQL into the Supabase SQL editor:

```sql
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
  updated_at timestamptz not null default timezone('utc', now())
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
  constraint purchases_verification_status_check check (verification_status in ('pending', 'valid', 'invalid', 'duplicate'))
);

create table if not exists public.payout_records (
  purchase_id text primary key references public.purchases (purchase_id) on delete cascade,
  status text not null check (status in ('none', 'queued', 'processing', 'refunded', 'failed')),
  tx_hash text,
  error_message text,
  updated_at timestamptz not null
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

create index if not exists purchases_created_at_idx on public.purchases (created_at desc);
create index if not exists purchases_active_created_at_idx
  on public.purchases (created_at desc)
  where payment_status = 'awaiting_payment' or payout_status in ('queued', 'processing', 'failed');
create index if not exists purchases_outcome_status_idx on public.purchases (outcome_status);
create index if not exists merch_items_display_order_idx on public.merch_items (display_order asc, name asc);
create index if not exists purchase_archives_created_at_idx on public.purchase_archives (created_at desc);
create index if not exists purchase_archives_archived_at_idx on public.purchase_archives (archived_at desc);
```

No shop products are inserted automatically. Add products from `/admin`; the storefront only shows active products with stock greater than zero.
Product images can be uploaded from `/admin`; uploads are stored in Supabase Storage under the `merch-images` bucket.

5. Start the app:

```bash
npm run dev
```

6. Open:

- Storefront: [http://localhost:3000](http://localhost:3000)
- Admin: [http://localhost:3000/admin](http://localhost:3000/admin)

## Routes

- `POST /api/purchase`
- `GET /api/purchase/[id]`
- `POST /api/payment/verify`
- `POST /api/payment/reconcile`
- `GET /api/admin/purchases`
- `GET /api/admin/transactions`
- `GET /api/admin/merch`
- `POST /api/admin/merch`
- `POST /api/admin/archive`
- `POST /api/payout`
