// =============================================================================
// Supabase Edge Function: lemonsqueezy-checkout
//
// Creates a hosted Lemon Squeezy checkout URL for the authenticated user.
// LS is a Merchant of Record — they handle VAT/tax in every jurisdiction.
//
// Trial: configure on the Variant in the LS dashboard (Variants → has-free-trial).
//        LS handles the 7-day trial automatically once enabled.
//
// Required env:
//   LEMONSQUEEZY_API_KEY        lsk_…
//   LEMONSQUEEZY_STORE_ID       12345
//   LEMONSQUEEZY_VARIANT_MONTHLY 67890 (variant id for $4.99/mo)
//   LEMONSQUEEZY_VARIANT_YEARLY  67891 (variant id for $39/yr)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LS_KEY      = Deno.env.get('LEMONSQUEEZY_API_KEY')!;
const LS_STORE    = Deno.env.get('LEMONSQUEEZY_STORE_ID')!;
const VAR_MONTHLY = Deno.env.get('LEMONSQUEEZY_VARIANT_MONTHLY')!;
const VAR_YEARLY  = Deno.env.get('LEMONSQUEEZY_VARIANT_YEARLY')!;
const SUPA_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization') || '';
  const supa = createClient(SUPA_URL, SUPA_SERVICE_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error } = await supa.auth.getUser();
  if (error || !userRes?.user || !userRes.user.email) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const user  = userRes.user;
  const admin = createClient(SUPA_URL, SUPA_SERVICE_KEY);

  let body: any;
  try { body = await req.json(); } catch (_) { body = {}; }
  const plan       = body.plan === 'monthly' ? 'monthly' : 'yearly';
  const returnUrl  = String(body.returnUrl || 'https://www.google.com/');
  const variantId  = plan === 'monthly' ? VAR_MONTHLY : VAR_YEARLY;
  if (!variantId || !LS_STORE) {
    return new Response(JSON.stringify({ error: 'LemonSqueezy ids not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Pre-write a free row so the webhook upsert has somewhere to land.
  await admin.from('subscriptions').upsert({
    user_id:    user.id,
    provider:   'lemonsqueezy',
    status:     'free',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  const successUrl = returnUrl.includes('?') ? `${returnUrl}&billing=success` : `${returnUrl}?billing=success`;

  // POST /v1/checkouts — JSON:API format
  const r = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + LS_KEY,
      'Accept':        'application/vnd.api+json',
      'Content-Type':  'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email:  user.email,
            custom: { supabase_user_id: user.id, plan },
          },
          product_options: {
            redirect_url: successUrl,
          },
          checkout_options: {
            embed: false,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: LS_STORE  } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return new Response(JSON.stringify({ error: data?.errors?.[0]?.detail || ('LS HTTP ' + r.status) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const url = data?.data?.attributes?.url;
  if (!url) {
    return new Response(JSON.stringify({ error: 'LS response had no url' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
