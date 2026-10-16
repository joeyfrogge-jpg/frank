require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { OAuth2Client } = require('google-auth-library');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';

app.use(cors());
app.use(express.json());

// Health
app.get('/.well-known/health', (req, res) => res.json({ ok: true }));

// Verify Google ID token and return a minimal user object
app.post('/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).send('Missing idToken');

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();

    const user = {
      sub: payload.sub,
      name: payload.name || 'User',
      email: payload.email,
      picture: payload.picture || '',
      plan: 'free'
    };

    // Optionally: create or lookup a Stripe Customer here and attach metadata.

    res.json(user);
  } catch (err) {
    console.error('Google verify failed:', err.message || err);
    res.status(401).send('Invalid Google token');
  }
});

// Create a Stripe Checkout session for subscriptions
app.post('/create-checkout-session', async (req, res) => {
  const { priceId, customer_email } = req.body;
  if (!priceId) return res.status(400).send('Missing priceId');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: customer_email || undefined,
      success_url: `${ORIGIN}/?checkout_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${ORIGIN}/?checkout_status=cancel`,
    });

    res.json({ id: session.id });
  } catch (e) {
    console.error('create-checkout-session error', e);
    res.status(500).send(e.message || 'Stripe error');
  }
});

// Retrieve a Checkout session (used by client after redirect)
app.get('/checkout-session', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).send('Missing session_id');

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json(session);
  } catch (e) {
    console.error('checkout-session retrieve error', e);
    res.status(500).send(e.message || 'Stripe error');
  }
});

// Webhook endpoint (raw body required for signing verification)
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.warn('No STRIPE_WEBHOOK_SECRET configured; skipping signature verification');
  }

  let event;
  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      // If no secret provided (dev), parse loosely
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature or parse failed:', err.message || err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Stripe webhook received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // session.customer_email and session.subscription are available
        // TODO: Persist subscription info in your DB and map to user by email
        console.log('Checkout completed for', session.customer_email, 'subscription=', session.subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        // Payment for subscription succeeded
        const invoice = event.data.object;
        console.log('Invoice paid', invoice.id);
        break;
      }
      case 'customer.subscription.deleted': {
        // Subscription canceled
        const sub = event.data.object;
        console.log('Subscription canceled', sub.id);
        break;
      }
      default:
        // Other events
        break;
    }
  } catch (error) {
    console.error('Error handling webhook:', error);
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FRANK server listening on ${PORT}`));
