// =============================================================================
// Supabase Edge Function: paddle-checkout
//
// Creates (or reuses) a Paddle customer for the authenticated Supabase user,
// then returns a hosted Paddle Checkout URL for the chosen plan.
//
// Trial: configure `trial_period` on the Price in the Paddle dashboard.
//        Paddle handles the 7-day free trial automatically.
//
// Required env (set with `supabase secrets set ...`):
//   PADDLE_API_KEY         pdl_live_… or pdl_sdbx_…
//   PADDLE_ENV             'live' (default) or 'sandbox'
//   PADDLE_PRICE_MONTHLY   pri_… for $4.99/mo
//   PADDLE_PRICE_YEARLY    pri_… for $39/yr
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PADDLE_KEY      = Deno.env.get('PADDLE_API_KEY')!;
const PADDLE_BASE     = (Deno.env.get('PADDLE_ENV') === 'sandbox')
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com';
const PRICE_MONTHLY   = Deno.env.get('PADDLE_PRICE_MONTHLY')!;
const PRICE_YEARLY    = Deno.env.get('PADDLE_PRICE_YEARLY')!;
const SUPA_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function paddle(path: string, init?: RequestInit) {
  const r = await fetch(PADDLE_BASE + path, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + PADDLE_KEY,
      'Content-Type':  'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Paddle ${path} -> HTTP ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function findOrCreateCustomer(email: string, userId: string): Promise<string> {
  // Paddle returns matched customer in the data array. Filter by email.
  const search = await paddle(`/customers?email=${encodeURIComponent(email)}`, { method: 'GET' });
  const hit = (search?.data || []).find((c: { email?: string }) => c.email?.toLowerCase() === email.toLowerCase());
  if (hit) return hit.id;

  const created = await paddle('/customers', {
    method: 'POST',
    body: JSON.stringify({ email, custom_data: { supabase_user_id: userId } }),
  });
  return created.data.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization') || '';
  const supa = createClient(SUPA_URL, SUPA_SERVICE_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error } = await supa.auth.getUser();
  if (error || !userRes?.user || !userRes.user.email) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const user = userRes.user;
  const admin = createClient(SUPA_URL, SUPA_SERVICE_KEY);

  let body: any;
  try { body = await req.json(); } catch (_) { body = {}; }
  const plan      = body.plan === 'monthly' ? 'monthly' : 'yearly';
  const returnUrl = String(body.returnUrl || 'https://www.google.com/');
  const priceId   = plan === 'monthly' ? PRICE_MONTHLY : PRICE_YEARLY;
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'Paddle price ids not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    // Reuse customer if we already saved one
    const { data: subRow } = await admin
      .from('subscriptions')
      .select('provider_customer_id, provider')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = (subRow?.provider === 'paddle') ? subRow.provider_customer_id : null;
    if (!customerId) {
      customerId = await findOrCreateCustomer(user.email, user.id);
      await admin.from('subscriptions').upsert({
        user_id:              user.id,
        provider:             'paddle',
        provider_customer_id: customerId,
        status:               'free',
        updated_at:           new Date().toISOString(),
      });
    }

    // Build return URL with success param
    const successUrl = returnUrl.includes('?') ? `${returnUrl}&billing=success` : `${returnUrl}?billing=success`;

    // Create a transaction → returns hosted checkout URL
    const trans = await paddle('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        items:        [{ price_id: priceId, quantity: 1 }],
        customer_id:  customerId,
        custom_data:  { supabase_user_id: user.id, plan },
        checkout:     { url: successUrl },
      }),
    });

    const url = trans?.data?.checkout?.url;
    if (!url) throw new Error('Paddle response had no checkout url');

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
