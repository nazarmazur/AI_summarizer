// Supabase Edge Function: stripe-webhook
//
// Receives Stripe events and mirrors subscription state into our
// `subscriptions` table. Configure in Stripe Dashboard:
//   Endpoint URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Events:
//     customer.subscription.created
//     customer.subscription.updated
//     customer.subscription.deleted
//     checkout.session.completed
//
// Required secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET   whsec_… (from Stripe dashboard for this endpoint)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

const STRIPE_SECRET     = Deno.env.get('STRIPE_SECRET_KEY')!;
const WEBHOOK_SECRET    = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPA_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' });
const admin  = createClient(SUPA_URL, SUPA_SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const sig = req.headers.get('stripe-signature') || '';
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
  } catch (e) {
    return new Response('Bad signature: ' + (e as Error).message, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = (s.metadata?.supabase_user_id as string) || (s.client_reference_id as string) || null;
      if (userId && s.customer) {
        await admin.from('subscriptions').upsert({
          user_id:            userId,
          stripe_customer_id: String(s.customer),
          status:             'active',
          updated_at:         new Date().toISOString(),
        });
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata?.supabase_user_id as string)
                  || await findUserByCustomer(String(sub.customer));
      if (!userId) return new Response('ok', { status: 200 });

      const price = sub.items?.data?.[0]?.price;
      const plan  = price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

      await admin.from('subscriptions').upsert({
        user_id:                userId,
        stripe_customer_id:     String(sub.customer),
        stripe_subscription_id: sub.id,
        status:                 sub.status,
        plan,
        price_id:               price?.id || null,
        current_period_end:     sub.current_period_end
                                   ? new Date(sub.current_period_end * 1000).toISOString()
                                   : null,
        cancel_at_period_end:   !!sub.cancel_at_period_end,
        trial_ends_at:          sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        updated_at:             new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('webhook handler error:', e);
    return new Response('handler error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});

async function findUserByCustomer(customerId: string): Promise<string | null> {
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id || null;
}
