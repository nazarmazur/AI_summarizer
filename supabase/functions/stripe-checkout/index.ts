// Supabase Edge Function: stripe-checkout
//
// Receives { plan: 'monthly' | 'yearly', returnUrl: string } from the
// authenticated extension and returns { url } pointing to a Stripe Checkout
// Session. The customer record is reused (or created) so the same Supabase
// user maps to the same Stripe customer over time.
//
// Required secrets (set with `supabase secrets set ...`):
//   STRIPE_SECRET_KEY       sk_live_… or sk_test_…
//   STRIPE_PRICE_MONTHLY    price_… for $4.99/mo
//   STRIPE_PRICE_YEARLY     price_… for $39/yr
//
// Deploy:
//   supabase functions deploy stripe-checkout --no-verify-jwt=false

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

const STRIPE_SECRET     = Deno.env.get('STRIPE_SECRET_KEY')!;
const PRICE_MONTHLY     = Deno.env.get('STRIPE_PRICE_MONTHLY')!;
const PRICE_YEARLY      = Deno.env.get('STRIPE_PRICE_YEARLY')!;
const SUPA_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' });

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization') || '';
  const supa = createClient(SUPA_URL, SUPA_SERVICE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Identify the calling user
  const { data: userRes, error: userErr } = await supa.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const user = userRes.user;

  // Parse body
  const body = await req.json().catch(() => ({}));
  const plan = (body.plan === 'monthly') ? 'monthly' : 'yearly';
  const returnUrl = String(body.returnUrl || '');
  const priceId = plan === 'monthly' ? PRICE_MONTHLY : PRICE_YEARLY;
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'Stripe price ids not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Look up or create the Stripe customer for this user
  const admin = createClient(SUPA_URL, SUPA_SERVICE_KEY);
  const { data: subRow } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let customerId = subRow?.stripe_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from('subscriptions').upsert({
      user_id: user.id,
      stripe_customer_id: customerId,
      status: 'free',
      updated_at: new Date().toISOString(),
    });
  }

  // Build the success/cancel URLs back to the options page
  const ret = returnUrl || 'https://www.google.com/';
  const successUrl = ret.includes('?')
    ? `${ret}&billing=success`
    : `${ret}?billing=success`;
  const cancelUrl = ret.includes('?')
    ? `${ret}&billing=cancel`
    : `${ret}?billing=cancel`;

  // 7-day free trial — only for first-time subscribers (we check if they've
  // ever had a Stripe subscription on this customer).
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 });
  const hasPriorSub = subs.data.length > 0;
  const trialDays = body.trial === false || hasPriorSub ? 0 : 7;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url:  cancelUrl,
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan },
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
    payment_method_collection: trialDays > 0 ? 'if_required' : 'always',
    client_reference_id: user.id,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
