alter table public.purchases
  drop constraint if exists purchases_payout_status_check;

alter table public.purchases
  add constraint purchases_payout_status_check
  check (payout_status in ('none', 'queued', 'processing', 'refunded', 'failed', 'needs_review'));

alter table public.payout_records
  drop constraint if exists payout_records_status_check;

alter table public.payout_records
  add constraint payout_records_status_check
  check (status in ('none', 'queued', 'processing', 'refunded', 'failed', 'needs_review'));
