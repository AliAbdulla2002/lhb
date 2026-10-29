# Data retention

Proposed defaults, **to be confirmed by the owner** and their accountant or legal adviser.
They are implemented in `app.purge_expired_data()`, which runs hourly through `pg_cron`.

| Data | Kept | Then |
|---|---|---|
| Rate-limit counters | 1 day | deleted |
| Pickup arrival events | 90 days | deleted |
| Car plate and colour on an order | 30 days after the order is completed or cancelled | cleared (order kept) |
| Audit log | 2 years | deleted |
| Daily order-number counters | 7 days | deleted |
| Orders, items, payments | not purged automatically (accounting) | — |
| Customer accounts | until the customer asks for deletion | see below |

**Account deletion:** delete the user in Dashboard → Authentication. Their profile, roles and favourites are removed automatically. Orders stay for accounting with the customer link removed (`customer_id` is set to null), but they still hold the name and phone snapshot taken at order time. If full anonymisation is required, clear `customer_name` and `customer_phone` on that customer's orders before deleting the account. A self-service deletion flow is not built yet.

Location is never collected. Car pickup works with the plate number only.
