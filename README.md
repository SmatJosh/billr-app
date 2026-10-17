# Billr

Invoicing app for Nigerian solo service providers and small vendors. Android first, built with Expo SDK 57 (React Native, TypeScript).

## Try it on your Android phone

1. Install [Node.js](https://nodejs.org) (the LTS version) on your computer.
2. Install **Expo Go** from the Play Store on your phone (it must support SDK 57).
3. In a terminal on your computer:
   ```bash
   git clone https://github.com/SmatJosh/billr-app.git
   cd billr-app
   npm install
   npx expo start
   ```
4. Scan the QR code that appears with Expo Go. Your phone and computer must be on the same Wi-Fi. If they are not, run `npx expo start --tunnel` instead.

Everything is stored on the phone, and the app works without internet. Signing in is optional: it backs your invoices up online and restores them on a new phone.

## What is in milestone 1

- Business profile and payment details (bank, account number, account name), saved as you type
- Clients and saved items
- Invoices with separate issue and due dates, quick payment terms, decimal quantities, flat or percent discount, optional 7.5% VAT, notes and terms
- Preview, PDF export through the share sheet (WhatsApp, email, Drive), and a WhatsApp message with the amount and bank details
- Mark as paid, and a home screen showing what is still owed

## What is in milestone 2

- Sign in with an emailed code (from the Business screen, or "Restore your invoices" on a new phone)
- Automatic backup of the business, clients, items and invoices to Supabase, and restore on a new phone
- Changes made on one phone appear on another signed-in phone. If both changed the same thing, the change not yet backed up wins
- Works offline: changes wait on the phone and upload when the internet is back

Setting up the Supabase project: [docs/supabase-setup.md](docs/supabase-setup.md).

Not yet: phone number sign-in, receipts and deposits, quotes and proforma, Billr Verified, Pro features.

## Development

```bash
npm test           # invoice maths, formatting and PDF template tests
npm run typecheck  # TypeScript
npx expo start     # dev server (press w for a web preview)
```

- Money is always integer kobo. See `src/lib/money.ts`.
- The phone's SQLite database is the source of truth. Schema and migrations are in `src/db/schema.ts`; add a new migration, never edit a shipped one.
- One HTML template (`src/lib/invoiceHtml.ts`) feeds the preview and the PDF, so payment details and notes appear on both.
- Sync lives in `src/sync/engine.ts` and is tested against a real SQLite database. Every synced table has `uid` (its cloud id), `rev` and `synced_rev`; triggers raise `rev` on any change, so new code gets backup for free. The cloud schema is in `supabase/migrations`.
