// =============================================================================
// Supabase Edge Function: lemonsqueezy-webhook
//
// Verifies LS X-Signature header and mirrors subscription state.
//
// Configure in LS Dashboard → Settings → Webhooks:
//   Callback URL: https://<project>.supabase.co/functions/v1/lemonsqueezy-webhook
//   Events: subscription_created, subscription_updated, subscription_cancelled,
//           subscription_resumed, subscription_expired, subscription_paused,
//           subscription_unpaused, subscription_payment_success,
//           subscription_payment_failed
//
// Required env:
//   LEMONSQUEEZY_WEBHOOK_SECRET   any string you set when creating the webhook
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hmacSha256Hex, safeEqual } from '../_shared/hmac.ts';

const WEBHOOK_SECRET    = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET')!;
const SUPA_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin             = createClient(SUPA_URL, SUPA_SERVICE_KEY);

function normaliseStatus(s?: string): string {
  // LS statuses: on_trial, active, paused, past_due, unpaid, cancelled, expired
  if (s === 'on_trial')                       return 'trialing';
  if (s === 'cancelled' || s === 'expired')   return 'canceled';
  if (s === 'past_due'  || s === 'unpaid')    return 'past_due';
  if (s === 'paused')                         return 'past_due';
  return s || 'active';
}

function planFromVariantName(name?: string): string {
  if (!name) return 'monthly';
  if (/year|annual/i.test(name)) return 'yearly';
  return 'monthly';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  const sig = req.headers.get('X-Signature') || '';
  const expected = await hmacSha256Hex(raw, WEBHOOK_SECRET);
  if (!safeEqual(expected, sig)) return new Response('Bad signature', { status: 400 });

  let event: any;
  try { event = JSON.parse(raw); } catch (_) { return new Response('Bad JSON', { status: 400 }); }

  const name = String(event?.meta?.event_name || '');
  if (!name.startsWith('subscription')) return new Response('ok', { status: 200 });

  try {
    const sub  = event.data;
    const attr = sub?.attributes || {};
    const meta = event?.meta?.custom_data || attr?.first_subscription_item?.custom_data || {};

    const userId = meta.supabase_user_id || await findUserByCustomer(String(attr.customer_id || ''));
    if (!userId) return new Response('ok', { status: 200 });

    await admin.from('subscriptions').upsert({
      user_id:                  userId,
      provider:                 'lemonsqueezy',
      provider_customer_id:     String(attr.customer_id || ''),
      provider_subscription_id: String(sub.id),
      status:                   normaliseStatus(attr.status),
      plan:                     planFromVariantName(attr.variant_name),
      price_id:                 String(attr.variant_id || ''),
      current_period_end:       attr.renews_at || null,
      cancel_at_period_end:     !!attr.cancelled,
      trial_ends_at:            attr.trial_ends_at || null,
      updated_at:               new Date().toISOString(),
    });
  } catch (e) {
    console.error('LS webhook handler error:', e);
    return new Response('handler error', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});

async function findUserByCustomer(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('provider', 'lemonsqueezy')
    .eq('provider_customer_id', customerId)
    .maybeSingle();
  return data?.user_id || null;
}
