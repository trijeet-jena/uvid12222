# Shiprocket setup

The customer courier-booking flow uses the Shiprocket API from the Cloudflare Worker. Keep the API credentials in Cloudflare Worker secrets; never add them to storefront code, Git, or browser storage.

From this folder, set the Shiprocket API account email and password:

```powershell
npx wrangler --config wrangler.toml secret put SHIPROCKET_EMAIL
npx wrangler --config wrangler.toml secret put SHIPROCKET_PASSWORD
```

Wrangler prompts for each value without putting it in this repository. The same secrets can be added in the Cloudflare dashboard under the `uvid-store-api` Worker settings.

The Shiprocket account also needs an active pickup address. After the store confirms the delivery charge and verifies payment, the customer can open the order confirmation or tracking page, expand **Book your courier with Shiprocket**, enter the packed parcel weight and dimensions plus their state, compare available courier rates, and book a courier. The Worker creates the Shiprocket shipment, assigns the selected courier, requests pickup, and saves the returned AWB and tracking details to the order. The admin can view those details and the shipping label on the invoice.
