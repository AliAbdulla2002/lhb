# Payments

## Current state

- **Cash on pickup** is the only payment method. It is enabled per restaurant in
  `/admin/settings` (`restaurant_settings.cash_on_pickup_enabled`).
- A `payments` row is created with every order (`unpaid`). When staff hand the order
  over (`ready → completed`), cash orders are marked `paid` in the same transaction.
  Today's sales and reports count completed orders only.
- **Online payment is not integrated.** The database rejects `payment_method = 'online'`
  (`lahab.payment_method_unavailable`) and the admin switch is locked. Nothing in the
  app claims online payment works.
- No card numbers, CVVs or payment credentials are ever stored. The `payments` table
  holds only the provider's references (`provider_ref`, `provider_event_id`).

## What the owner needs to decide

1. Provider: e.g. BenefitPay, Tap Payments, or a Credimax/MPGS hosted checkout.
2. A merchant account with test (sandbox) credentials first, then live credentials.
3. Refund policy and who in the team may issue refunds.

## Integration design (to implement once a provider is chosen)

1. **Initiate** — Edge Function `payment-initiate` (user JWT): loads the order with
   `place_order`'s stored total (never a client amount), creates a hosted-checkout
   session with the provider, stores `provider_ref` and sets the payment `pending`.
   The provider secret key lives only in Edge Function secrets
   (`supabase secrets set PAYMENT_SECRET_KEY=...`), never in `VITE_*` variables.
2. **Redirect** — the customer pays on the provider's hosted page (keeps card data out
   of this app's scope).
3. **Webhook** — Edge Function `payment-webhook` (no user JWT):
   - verify the provider's signature over the raw body with the webhook secret; reject otherwise;
   - process idempotently: `provider_event_id` is unique, so a replayed event is a no-op;
   - check amount and currency (BHD, 3 decimals) against the stored order total;
   - update `payments.status` and `orders.payment_status` in one transaction, plus an audit entry.
4. **Order flow** — for online orders, staff confirm only after `payment_status = 'paid'`;
   unpaid online orders expire and are cancelled automatically.
5. **Tests** — provider sandbox end-to-end; replayed/forged webhooks rejected; amount
   mismatch rejected.

Allowing `online` in `app.place_order` and unlocking the admin switch are the last steps,
after the webhook is verified in the sandbox.
