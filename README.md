# Circles EthCC shop

Next.js merch checkout for in-person booth sales using Circles CRC. Buyers do not connect a wallet in the browser. The app creates a signed purchase intent, shows a large QR, watches the organization avatar's on-chain transaction history, and can trigger real CRC refunds from a server-only treasury signer.


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

4. Create the required tables in Supabase:

Paste this into the Supabase SQL editor:

```sql
create table if not exists public.merch_pricing (
  id text primary key,
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
  payment_detected_at timestamptz
);

create table if not exists public.payout_records (
  purchase_id text primary key references public.purchases (purchase_id) on delete cascade,
  status text not null check (status in ('none', 'queued', 'processing', 'refunded', 'failed')),
  tx_hash text,
  error_message text,
  updated_at timestamptz not null
);
```

The app seeds `merch_pricing` automatically from the in-repo catalog on first read, so no separate insert step is required.

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
- `POST /api/payout`
