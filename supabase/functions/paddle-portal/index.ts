// =============================================================================
// Supabase Edge Function: paddle-portal
//
// Returns { url } pointing to the Paddle Customer Portal for the authenticated
// user. Portal lets them update payment method, view invoices, cancel.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PADDLE_KEY  = Deno.env.get('PADDLE_API_KEY')!;
const PADDLE_BASE = (Deno.env.get('PADDLE_ENV') === 'sandbox')
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com';
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
    .select('provider_customer_id')
    .eq('user_id', userRes.user.id)
    .eq('provider', 'paddle')
    .maybeSingle();
  if (!subRow?.provider_customer_id) {
    return new Response(JSON.stringify({ error: 'No Paddle customer for this user' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // POST /customers/{id}/portal-sessions → returns general overview URL
  const r = await fetch(`${PADDLE_BASE}/customers/${subRow.provider_customer_id}/portal-sessions`, {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + PADDLE_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return new Response(JSON.stringify({ error: data?.error || ('Paddle HTTP ' + r.status) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const url = data?.data?.urls?.general?.overview;
  if (!url) {
    return new Response(JSON.stringify({ error: 'Paddle portal returned no url' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
