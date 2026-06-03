// =============================================================================
// Supabase Edge Function: paddle-webhook
//
// Verifies Paddle webhook signature (Paddle-Signature header) and mirrors
// subscription state into our `subscriptions` table.
//
// Configure in Paddle Dashboard → Developer → Webhooks:
//   Endpoint URL: https://<project>.supabase.co/functions/v1/paddle-webhook
//   Subscribe to: subscription.created, subscription.updated,
//                 subscription.canceled, subscription.activated,
//                 subscription.trialing, transaction.completed
//
// Required env:
//   PADDLE_WEBHOOK_SECRET   pdl_ntfset_…
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hmacSha256Hex, safeEqual } from '../_shared/hmac.ts';

const WEBHOOK_SECRET    = Deno.env.get('PADDLE_WEBHOOK_SECRET')!;
const SUPA_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin             = createClient(SUPA_URL, SUPA_SERVICE_KEY);

function parseSignatureHeader(h: string): { ts?: string; h1?: string } {
  const out: Record<string, string> = {};
  for (const part of h.split(';')) {
    const [k, v] = part.split('=');
    if (k && v) out[k.trim()] = v.trim();
  }
  return out;
}

async function verify(req: Request, rawBody: string): Promise<boolean> {
  const header = req.headers.get('Paddle-Signature') || '';
  const { ts, h1 } = parseSignatureHeader(header);
  if (!ts || !h1) return false;
  const expected = await hmacSha256Hex(`${ts}:${rawBody}`, WEBHOOK_SECRET);
  return safeEqual(expected, h1);
}

function planFromBillingCycle(intervalUnit?: string): string {
  if (intervalUnit === 'year')  return 'yearly';
  if (intervalUnit === 'month') return 'monthly';
  return 'monthly';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  if (!(await verify(req, raw))) return new Response('Bad signature', { status: 400 });

  let event: any;
  try { event = JSON.parse(raw); } catch (_) { return new Response('Bad JSON', { status: 400 }); }

  try {
    const t = String(event.event_type || '');
    if (!t.startsWith('subscription.')) {
      // We only care about subscription lifecycle events.
      return new Response('ok', { status: 200 });
    }

    const sub = event.data;
    if (!sub) return new Response('ok', { status: 200 });

    const customerId    = sub.customer_id;
    const subId         = sub.id;
    const customData    = sub.custom_data || {};
    const userId        = customData.supabase_user_id
                       || await findUserByCustomer(customerId);
    if (!userId) return new Response('ok', { status: 200 });

    const items   = sub.items || [];
    const priceId = items[0]?.price?.id || items[0]?.price_id || null;
    const interval = items[0]?.price?.billing_cycle?.interval || sub.billing_cycle?.interval;
    const plan    = planFromBillingCycle(interval);

    // Paddle statuses: trialing, active, past_due, paused, canceled
    const status = sub.status === 'paused' ? 'past_due' : sub.status;

    await admin.from('subscriptions').upsert({
      user_id:                  userId,
      provider:                 'paddle',
      provider_customer_id:     customerId,
      provider_subscription_id: subId,
      status,
      plan,
      price_id:                 priceId,
      current_period_end:       sub.current_billing_period?.ends_at || null,
      cancel_at_period_end:     !!sub.scheduled_change && sub.scheduled_change.action === 'cancel',
      trial_ends_at:            sub.trial_dates?.ends_at || null,
      updated_at:               new Date().toISOString(),
    });
  } catch (e) {
    console.error('Paddle webhook handler error:', e);
    return new Response('handler error', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});

async function findUserByCustomer(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('provider', 'paddle')
    .eq('provider_customer_id', customerId)
    .maybeSingle();
  return data?.user_id || null;
}
