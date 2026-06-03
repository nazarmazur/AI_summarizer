// =============================================================================
// Supabase Edge Function: lemonsqueezy-portal
//
// Returns { url } for the LS customer portal (manage billing / cancel).
// LS exposes the portal URL on the subscription object itself
// (`attributes.urls.customer_portal`).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LS_KEY            = Deno.env.get('LEMONSQUEEZY_API_KEY')!;
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
  const supa  = createClient(SUPA_URL, SUPA_SERVICE_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error } = await supa.auth.getUser();
  if (error || !userRes?.user) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const admin = createClient(SUPA_URL, SUPA_SERVICE_KEY);

  const { data: subRow } = await admin
    .from('subscriptions')
    .select('provider_subscription_id, provider')
    .eq('user_id', userRes.user.id)
    .eq('provider', 'lemonsqueezy')
    .maybeSingle();

  if (!subRow?.provider_subscription_id) {
    return new Response(JSON.stringify({ error: 'No active LemonSqueezy subscription' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const r = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subRow.provider_subscription_id}`, {
    headers: { 'Authorization': 'Bearer ' + LS_KEY, 'Accept': 'application/vnd.api+json' },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return new Response(JSON.stringify({ error: data?.errors?.[0]?.detail || 'LS HTTP ' + r.status }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const url = data?.data?.attributes?.urls?.customer_portal;
  if (!url) {
    return new Response(JSON.stringify({ error: 'LS portal URL missing' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ url }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
