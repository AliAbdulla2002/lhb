# Owner checklist — before launch

Everything below needs the restaurant's input. Nothing here was invented. Items marked
*(admin)* can be entered directly in `/admin` once the first super admin exists.

## Brand

- [ ] Official logo as a vector file (SVG, AI or PDF). The site currently shows a text wordmark.
- [ ] Official brand colours and font. The current red, flame and cream are estimated from the Instagram avatar (`src/app.css`).
- [ ] Food photography: original files, or written permission to use specific Instagram posts. *(admin: product photos)*

## Menu *(admin)*

- [ ] Categories and items with Arabic and English names and descriptions.
- [ ] Prices in BHD, sizes, add-ons and sauces with extra prices, and which choices are required.
- [ ] Best sellers and featured items.
- [ ] Remove every SAMPLE item before launch (they only exist in the local dev seed).

## Branch & hours *(admin)*

- [ ] Confirm the branch list (only A'ali is verified).
- [ ] Confirm opening hours per weekday. The sources disagree: 5 pm–12 am (Instagram bio, Google) vs 12 pm–12 am (an older Instagram post).
- [ ] The Google Maps link for the branch, and the pickup parking instructions in Arabic and English.
- [ ] Preparation lead time and orders per 15-minute slot.
- [ ] Holiday closures (e.g. Eid).

## Policies & content *(admin: Settings & content)*

- [ ] Approved "About Lahab" text.
- [ ] Privacy policy and terms and conditions (legal review). The placeholders say "pending legal review".
- [ ] Data retention periods ([DATA_RETENTION.md](DATA_RETENTION.md)).
- [ ] Cancellation and refund policy.

## Payments

- [ ] Approve cash on pickup. *(admin: Settings → Cash on pickup)*
- [ ] Decide whether online payment is wanted, and the provider (see [PAYMENTS.md](PAYMENTS.md)).
- [ ] Delivery: not offered. It needs zones, fees and a decision on Talabat/Keeta vs own drivers.

## People *(admin: Staff & roles)*

- [ ] Who is the first super admin (the owner signs up, then the provisioning script is run).
- [ ] Managers, and staff per branch.

## Accounts & services

- [ ] Supabase project (staging + production) owned by the restaurant.
- [ ] Domain name and static hosting account.
- [ ] Email sender (SMTP) for confirmation and password-reset emails.

## Go-live switch

- [ ] After the smoke checklist passes in production: `/admin/settings` → **Accept online orders**.
