// Edit this file and replace the placeholders with your real keys before deploying.
window.APP_CONFIG = {
  // Google OAuth 2.0 Client ID for the web application (OAuth 2.0 Client ID - Web)
  // Example: "12345-abc.apps.googleusercontent.com"
  GOOGLE_CLIENT_ID: "REPLACE_WITH_GOOGLE_CLIENT_ID.apps.googleusercontent.com",

  // Stripe publishable key for client-side Stripe.js
  STRIPE_PUBLISHABLE_KEY: "pk_test_REPLACE",

  // Price IDs for your Stripe products. Configure these in Stripe Dashboard.
  STRIPE_PRICE_IDS: {
    plus: "price_REPLACE_PLUS",
    premium: "price_REPLACE_PREMIUM",
    platinum: "price_REPLACE_PLATINUM"
  },

  // Optional: enable APK automation in the workflow (requires secrets and config)
  ENABLE_APK_WORKFLOW: false
};
