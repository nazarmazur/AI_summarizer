// Supabase Edge Function: stripe-portal
//
// Returns { url } pointing to a Stripe Billing Portal session for the
// authenticated user, so they can cancel, change card, or download invoices.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

const STRIPE_SECRET    = Deno.env.get('STRIPE_SECRET_KEY')!;
const SUPA_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  const { data: userRes, error } = await supa.auth.getUser();
  if (error || !userRes?.user) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const user = userRes.user;

  const admin = createClient(SUPA_URL, SUPA_SERVICE_KEY);
  const { data: subRow } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!subRow?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: 'No Stripe customer for this user' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const body = await req.json().catch(() => ({}));
  const returnUrl = String(body.returnUrl || 'https://www.google.com/');

  const session = await stripe.billingPortal.sessions.create({
    customer:    subRow.stripe_customer_id,
    return_url:  returnUrl,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
