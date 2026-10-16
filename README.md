# Billr

Invoicing app for Nigerian solo service providers and small vendors. Android first, built with Expo (React Native, TypeScript).

## Try it on your Android phone

1. Install [Node.js](https://nodejs.org) (the LTS version) on your computer.
2. Install **Expo Go** from the Play Store on your phone.
3. In a terminal on your computer:
   ```bash
   git clone https://github.com/SmatJosh/billr-app.git
   cd billr-app
   npm install
   npx expo start
   ```
4. Scan the QR code that appears with Expo Go. Your phone and computer must be on the same Wi-Fi. If they are not, run `npx expo start --tunnel` instead.

Everything is stored on the phone. No account or internet connection is needed.

## What is in milestone 1

- Business profile and payment details (bank, account number, account name), saved as you type
- Clients and saved items
- Invoices with separate issue and due dates, quick payment terms, decimal quantities, flat or percent discount, optional 7.5% VAT, notes and terms
- Preview, PDF export through the share sheet (WhatsApp, email, Drive), and a WhatsApp message with the amount and bank details
- Mark as paid, and a home screen showing what is still owed

Not yet: sign-in and sync (milestone 2), receipts and deposits, quotes and proforma, Billr Verified, Pro features.

## Development

```bash
npm test           # invoice maths, formatting and PDF template tests
npm run typecheck  # TypeScript
npx expo start     # dev server (press w for a web preview)
```

- Money is always integer kobo. See `src/lib/money.ts`.
- The phone's SQLite database is the source of truth. Schema and migrations are in `src/db/schema.ts`; add a new migration, never edit a shipped one.
- One HTML template (`src/lib/invoiceHtml.ts`) feeds the preview and the PDF, so payment details and notes appear on both.
