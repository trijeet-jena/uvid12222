# Connect UVID to Cloudflare and Supabase Storage

This Worker uses Cloudflare D1 for products, orders, and image metadata, and
Supabase Storage for uploaded image files. The same image URL is saved with the
product in D1, so the admin and customer pages show the same photo. Existing
images stored in D1 continue to work; new uploads go to Supabase after it is
connected.

## One-time setup in VS Code

Open the extracted `stationery` folder in VS Code. Open **Terminal → New
Terminal**, then run these commands one at a time:

```powershell
cd cloudflare-store
npm install
npx wrangler login
npx wrangler --config wrangler.toml d1 execute uvid-store --remote --file=schema.sql
npx wrangler --config wrangler.toml d1 execute uvid-store --remote --file=seed-catalog.sql
```

`wrangler login` opens a Cloudflare page. Approve it with the same account
where you created `uvid-store`.

The Supabase project already has a bucket named `product-image`. Keep it
**Public** so customers can view product photos. Restrict its allowed content
types to JPEG, PNG, WebP, and GIF, and set its per-file limit to 5,500,000
bytes. Public access allows reading product photos; uploads and deletes still
go through the admin-only Cloudflare Worker.

The existing bucket is already configured with those settings. The project's
public URL is preconfigured in `wrangler.toml`; only its secret API key must be
entered into Cloudflare.

Now add the admin credentials as encrypted Cloudflare secrets. Run each command
and enter the value when Wrangler prompts:

```powershell
npx wrangler --config wrangler.toml secret put ADMIN_EMAIL
npx wrangler --config wrangler.toml secret put ADMIN_PASSWORD
npx wrangler --config wrangler.toml secret put SESSION_SECRET
npx wrangler --config wrangler.toml secret put SUPABASE_SECRET_KEY
```

Use your admin Gmail for `ADMIN_EMAIL`, choose a strong admin password, and set
`SESSION_SECRET` to a different random value at least 32 characters long. Keep
all secret values private. Copy a new `sb_secret_...` key from your Supabase
project's **Project Settings → API Keys**. When Wrangler prompts for
`SUPABASE_SECRET_KEY`, enter the key directly in the terminal. Do not paste
the secret key into the website files, GitHub, or chat. Customer sign-in
remains Gmail-only with no password or OTP, as requested.

Deploy the backend:

```powershell
npx wrangler --config wrangler.toml deploy
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
   refresh the storefront. Product details and image links are saved in D1;
   the uploaded photo file is saved in Supabase Storage and can be viewed on
   the customer page.

## Image storage

Product and variant uploads are limited to 5.5 MB and stored as files in the
Supabase `product-image` bucket. D1 keeps product/variant links and small
image metadata. Legacy image files already stored in D1 remain readable; they
are not copied to Supabase automatically. Supabase's free storage allowance is
limited, so monitor usage in its dashboard.

If the free account reaches its D1 daily read/write allowance, requests stop
until the allowance resets; do not upgrade or add a paid subscription unless
you choose to. Watch D1 usage in **Cloudflare → Storage & databases → D1 →
uvid-store → Metrics**.

## Phone push notifications for paid orders

The Worker sends a browser push notification after an admin confirms a UPI
payment. The alert includes the customer name, order number, total, and paid
status. This uses the browser's push service and does not require MSG91, DLT
registration, SMS credits, or a paid SMS gateway. The alert reaches each phone
or browser that has enabled notifications from Admin → Settings.

Generate a VAPID key pair once. Put the public key in the Worker's
`VAPID_SERVER_PUBLIC_KEY` variable in `wrangler.toml`; keep the private key
only in Cloudflare Secrets:

```powershell
npx wrangler --config wrangler.toml secret put VAPID_SERVER_PRIVATE_KEY
```

When prompted, paste the private key and press Enter. Do not commit the private
key or paste it into chat. `VAPID_SUBJECT` is set to the store website URL.
After configuring the keys, run the D1 migration and deploy the Worker. Then
open the admin page on the phone, sign in, go to **Settings**, and choose
**Enable on this phone**. Allow notifications when the browser asks. Use the
same steps on each additional device that should receive order alerts.

If a phone alert could not be delivered when payment was confirmed, open the
paid order's invoice and choose **Send phone alert** to retry. The order stays
marked paid even if a notification cannot be delivered.

## After changing backend code

From the `cloudflare-store` folder run:

```powershell
npx wrangler --config wrangler.toml d1 migrations apply uvid-store --remote
npx wrangler --config wrangler.toml deploy
```

The schema adds the metadata tables used to link images to Supabase objects and
a persistent order-number counter. New orders receive IDs such as `UVID001`,
`UVID002`, and so on. Existing orders keep their current IDs; if there are
already numbered `UVID` orders, the counter continues after the highest one.
Cancelled orders keep their number, so IDs are never reused.

The migration command applies any new tables without deleting existing
products, images, users, or orders. Netlify redeploys automatically after the
website files are pushed.

Customer delivery addresses are saved under the signed-in Gmail account in D1.
