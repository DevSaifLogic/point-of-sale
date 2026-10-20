# Point of Sale

A local point-of-sale dashboard prototype with inventory, sales, and receipt workflows.

## Run locally

Requires Node.js 18 or later.

```powershell
Copy-Item .env.example .env
# Edit .env and replace the password with a unique secret of at least 16 characters.
npm install
npm start
```

Open `http://127.0.0.1:3000`. The extended alternate server can be started with `npm run start:extended`.

The app creates JSON files under `database/`. They may contain customer, inventory, sales, serial-number, or license-key data and are intentionally ignored by Git. The checked-in receipt workbook uses a generic store label and has contact details removed; customize the label locally with `RECEIPT_STORE_NAME`.

This is a local prototype, not a production-ready or internet-facing POS system. Keep `HOST=127.0.0.1`; its current authentication and data-storage design has not been hardened for deployment. Use TLS only with certificates stored outside the repository.
