-- =============================================================================
-- AI Summarizer — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → Run.
-- Re-runs are safe (idempotent where possible).
-- =============================================================================

-- 1. Profile row mirrored from auth.users. Lets us store per-user app data
--    safely under Row-Level Security without touching the protected auth schema.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  ui_lang     text default 'auto',
  created_at  timestamptz not null default now()
);

-- 2. Subscription state, mirrored from the billing provider via webhook.
--    Anyone without a row here is treated as Free.
--    Supports Paddle, Lemon Squeezy, and Stripe in parallel — the active
--    provider per row is recorded in `provider`.
create table if not exists public.subscriptions (
  user_id                  uuid primary key references auth.users(id) on delete cascade,

  -- Generic, provider-agnostic identifiers (preferred — used by all new code)
  provider                 text not null default 'paddle',  -- 'paddle' | 'lemonsqueezy' | 'stripe'
  provider_customer_id     text,
  provider_subscription_id text,

  -- Legacy Stripe-specific (kept for backward compat; unused once provider!='stripe')
  stripe_customer_id       text,
  stripe_subscription_id   text,

  status               text not null default 'free',  -- 'free' | 'trialing' | 'active' | 'past_due' | 'canceled'
  plan                 text,                          -- 'monthly' | 'yearly' | 'lifetime'
  price_id             text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at        timestamptz,
  updated_at           timestamptz not null default now()
);

-- Safe upgrades from earlier schema revisions
alter table public.subscriptions add column if not exists provider                 text not null default 'paddle';
alter table public.subscriptions add column if not exists provider_customer_id     text;
alter table public.subscriptions add column if not exists provider_subscription_id text;

-- Backfill from legacy stripe columns if those rows existed
update public.subscriptions
   set provider = 'stripe',
       provider_customer_id     = stripe_customer_id,
       provider_subscription_id = stripe_subscription_id
 where stripe_customer_id is not null
   and provider_customer_id is null;

-- Uniqueness on the generic identifier per provider
create unique index if not exists subscriptions_provider_customer_uniq
  on public.subscriptions (provider, provider_customer_id)
  where provider_customer_id is not null;

-- 3. Monthly usage counter for users on the pooled API.
--    One row per user per (year, month). Used to enforce quotas.
create table if not exists public.usage (
  user_id     uuid not null references auth.users(id) on delete cascade,
  year_month  text not null,                   -- 'YYYY-MM' for cheap indexing
  count       integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, year_month)
);

-- 4. Summaries history.
create table if not exists public.summaries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  video_id       text not null,
  video_title    text,
  video_channel  text,
  language       text,
  length         text,
  model          text,
  summary_md     text,
  timestamps_md  text,
  created_at     timestamptz not null default now()
);

create index if not exists summaries_user_created_idx on public.summaries (user_id, created_at desc);
create index if not exists usage_user_month_idx       on public.usage (user_id, year_month);

-- 5. Row-Level Security
alter table public.profiles      enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage         enable row level security;
alter table public.summaries     enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions for select using (auth.uid() = user_id);
-- INSERT / UPDATE only via service-role (Edge Function: stripe-webhook). No client policy.

drop policy if exists "usage: read own" on public.usage;
create policy "usage: read own" on public.usage for select using (auth.uid() = user_id);
-- INSERT / UPDATE only via service-role (Edge Function: ai-proxy). No client policy.

drop policy if exists "summaries: read own"   on public.summaries;
drop policy if exists "summaries: insert own" on public.summaries;
drop policy if exists "summaries: delete own" on public.summaries;
create policy "summaries: read own"   on public.summaries for select using (auth.uid() = user_id);
create policy "summaries: insert own" on public.summaries for insert with check (auth.uid() = user_id);
create policy "summaries: delete own" on public.summaries for delete using (auth.uid() = user_id);

-- 6. Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7. Convenience view: each user's effective tier + current-month usage,
--    fetchable in a single REST GET. The extension reads this on launch.
create or replace view public.me_status as
select
  u.id                                                                                  as user_id,
  coalesce(s.status, 'free')                                                            as status,
  coalesce(s.plan, null)                                                                as plan,
  s.current_period_end,
  s.cancel_at_period_end,
  s.trial_ends_at,
  case
    when s.status in ('trialing', 'active') then 'pro'
    else 'free'
  end                                                                                   as tier,
  coalesce(usg.count, 0)                                                                as month_usage,
  to_char(now() at time zone 'utc', 'YYYY-MM')                                          as year_month
from auth.users u
left join public.subscriptions s on s.user_id = u.id
left join public.usage usg
  on usg.user_id = u.id and usg.year_month = to_char(now() at time zone 'utc', 'YYYY-MM')
where u.id = auth.uid();

grant select on public.me_status to authenticated;

-- 8. RPC: atomically bump the usage counter for the current user.
--    Called by the ai-proxy Edge Function (service-role) after each pooled call.
create or replace function public.bump_usage(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ym text := to_char(now() at time zone 'utc', 'YYYY-MM');
  new_count integer;
begin
  insert into public.usage (user_id, year_month, count)
  values (p_user_id, ym, 1)
  on conflict (user_id, year_month) do update
    set count = public.usage.count + 1,
        updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$;

revoke all on function public.bump_usage(uuid) from public, anon, authenticated;
-- service-role only; ai-proxy Edge Function invokes it.
