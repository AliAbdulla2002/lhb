# Owner checklist — before launch

Everything below needs the restaurant's input. Nothing here was invented. Items marked
*(admin)* can be entered directly in `/admin` once the first super admin exists.

## Brand

- [x] Logo supplied (150 px). It's used in the header, home page and favicon.
- [ ] The logo as a vector file (SVG, AI or PDF), for sharp large and print sizes.
- [x] Brand colours: sampled from the supplied menu artwork (red #E54135, yellow #FABA10, maroon #5A2828, cream #F0E4B2).
- [ ] Brand font name, if there is one. The menu headings use a display font that I couldn't identify; the site uses Alexandria / Readex Pro.
- [ ] Food photography: original files. The photos inside the menu images are too small (about 150 px) to reuse. *(admin: product photos)*

## Menu *(admin)*

- [x] Official menu supplied and transcribed: 10 categories, 25 items, Arabic text and prices as printed (`supabase/menu/official-menu-2026-10.sql`).
- [ ] Review the **English** names and descriptions. They are my draft translations (e.g. «سقنشر» → "Signature", «بطاطس عمان» → "Oman chips").
- [ ] Check the Arabic transcription against the menu (spelling as printed, e.g. «داينمايت» in one title and «دايناميت» in the descriptions).
- [ ] Confirm the item order, featured items (provisionally: shawarma burger, shawarma plate, Arabic box, Lahab salad) and best sellers (none set).
- [ ] Any sizes or paid extras not shown on the printed menu.

## Branch & hours *(admin)*

- [ ] Confirm the branch list (only A'ali is verified).
- [ ] Confirm opening hours per weekday. The sources disagree: 5 pm–12 am (Instagram bio, Google) vs 12 pm–12 am (an older Instagram post).
- [x] Phone 17232805 and WhatsApp 33447433 (from the menu).
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
