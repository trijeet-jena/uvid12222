# Connect UVID to Cloudflare's free backend

This Worker uses the D1 database `uvid-store` whose ID is already in
`wrangler.toml`. It keeps the existing Netlify customer and admin pages and
connects both to the same product and image database. No R2 subscription is
used.

## One-time setup in VS Code

Open the extracted `stationery` folder in VS Code. Open **Terminal → New
Terminal**, then run these commands one at a time:

```powershell
cd cloudflare-store
npm install
npx wrangler login
npx wrangler d1 execute uvid-store --remote --file=schema.sql
npx wrangler d1 execute uvid-store --remote --file=seed-catalog.sql
```

`wrangler login` opens a Cloudflare page. Approve it with the same account
where you created `uvid-store`.

Now add the admin credentials as encrypted Cloudflare secrets. Run each command
and enter the value when Wrangler prompts:

```powershell
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Use your admin Gmail for `ADMIN_EMAIL`, choose a strong admin password, and set
`SESSION_SECRET` to a different random value at least 32 characters long. Keep
these values private. Customer sign-in remains Gmail-only with no password or
OTP, as requested.

## PhonePe checkout setup

The storefront now sends customers to PhonePe's hosted Standard Checkout and
checks the final order status on the server. First activate a PhonePe Payment
Gateway merchant account and get its Client ID, Client Secret, and Client
Version from **PhonePe Business Dashboard → Developer Settings**. Do not put
these credentials in the website files or GitHub. In the same terminal, add
them as encrypted Worker secrets (Wrangler prompts for each value):

```powershell
npx wrangler secret put PHONEPE_CLIENT_ID
npx wrangler secret put PHONEPE_CLIENT_SECRET
npx wrangler secret put PHONEPE_CLIENT_VERSION
```

The included Worker setting uses `PHONEPE_ENV = "SANDBOX"` so the live store
does not accidentally charge a customer while credentials and checkout are
being set up. Ask PhonePe to enable production after completing its onboarding
and UAT process. To go live, change that value to `"PRODUCTION"` in
`wrangler.toml`, then deploy again. Use the production credentials PhonePe gives
your merchant account. The redirect origin is already set to the store's `.com`
domain and must remain one of the origins listed by `PUBLIC_ORIGIN`.

PhonePe shows the payment methods enabled for the merchant account. UPI,
cards, and net banking can appear when enabled for the account; the website
does not claim that wallets, EMI, or Pay Later are available unless PhonePe
enables them. PhonePe checkout remains unavailable until its credentials are
added and the merchant account is active.

Deploy the backend:

```powershell
npx wrangler deploy
```

Wrangler prints a URL similar to:

```text
https://uvid-store-api.your-account.workers.dev
```

## Connect the existing Netlify site

1. In VS Code, open the top-level `netlify.toml` file in the `stationery`
   folder.
2. This package is preconfigured for the `uvid21-store` workers.dev subdomain.
   Confirm Wrangler printed `https://uvid-store-api.uvid21-store.workers.dev`.
   If you selected a different subdomain, replace `uvid21-store` in both
   Worker targets in the top-level `netlify.toml` with the subdomain from
   Wrangler's URL.
3. Save `netlify.toml`.
4. Push the updated `stationery` folder to the same GitHub repository Netlify
   uses. Netlify should redeploy automatically. If it does not, open Netlify's
   site and choose **Deploys → Trigger deploy**.
5. Open `https://uvid09art12and48craft54.netlify.app/admin/`, sign in with the admin Gmail and
   password you set above, add a test product and a compressed photo, then
   refresh the storefront. The product and photo are saved to the shared D1
   database, so the customer page can load them too.

## Important image size limit on the free database

Cloudflare D1 Free currently allows 500 MB per database, 5 GB total storage
across the account, and a maximum 2 MB row. This package caps a compressed
image at 1.4 MB so it fits safely under that row limit. If an upload is too
large, choose a smaller image or reduce its dimensions/quality in the admin
image editor. The included starting catalog has its product descriptions and
existing local photos copied into the site's `assets/cf-store/` folder; new
photos uploaded in Admin are stored in D1 and served from the same site.

If the free account reaches its D1 daily read/write allowance, requests stop
until the allowance resets; do not upgrade or add a paid subscription unless
you choose to. Watch D1 usage in **Cloudflare → Storage & databases → D1 →
uvid-store → Metrics**.

## After changing backend code

From the `cloudflare-store` folder run:

```powershell
npx wrangler deploy
```

Run the D1 schema command from the first section only when a backend change
adds a database table or column. PhonePe checkout uses the existing order
table and does not need a database migration. Netlify needs redeploying when
the website files or `netlify.toml` change.

Product photos uploaded by Admin are stored as binary data in D1. The Worker
converts D1's returned byte array back to image bytes before responding, so the
browser receives a real JPEG/PNG/WebP instead of text. Customer delivery
addresses are saved under the signed-in Gmail account in the same database.
