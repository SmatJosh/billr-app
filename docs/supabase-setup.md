# Setting up backup (Supabase)

Billr keeps everything on the phone and backs it up to a Supabase project. You set the project up once, which takes about 15 minutes. Nothing here costs money on Supabase's free plan.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com), sign up (GitHub sign-in is fine) and click **New project**.
2. Name it **Billr**. Pick a region in Europe, such as London (West EU); it is the closest to Nigeria.
3. Supabase asks for a database password. Save it in your password manager. Billr does not need it, and nobody should ask you for it.
4. Wait a minute or two while the project starts.

## 2. Create the backup tables

1. In the left menu, open **SQL Editor** and click **New query**.
2. Open https://raw.githubusercontent.com/SmatJosh/billr-app/milestone-2-sign-in-backup/supabase/migrations/0001_backup.sql, select all the text (Ctrl + A), copy it (Ctrl + C), paste it into the editor and click **Run**.
3. You should see "Success. No rows returned". Under **Table Editor** you will now see five tables: businesses, clients, items, documents and document_lines.

These tables have row-level security switched on. Each signed-in person can only read and change their own rows, and nobody can delete rows through the app.

## 3. Make the sign-in email send a code

Billr signs people in with a code sent by email (6 to 8 digits, set by "Email OTP Length" under Authentication > Sign In / Providers > Email), which they type into the app. Supabase's default email sends a link instead, and its templates can only be edited once you connect your own email service (SMTP). That service is also what lets people outside your Supabase team get codes. Brevo is free (300 emails a day) and needs no domain:

1. Sign up at [brevo.com](https://www.brevo.com). Under **Senders, Domains & Dedicated IPs > Senders**, add your email address and confirm it with the code Brevo sends.
2. Under **SMTP & API > SMTP**, click **Generate a new SMTP key**. Keep the page open.
3. In Supabase, open **Authentication > Emails** and click **Set up SMTP**. Switch custom SMTP on and fill in: sender email (the address you verified), sender name `Billr`, host `smtp-relay.brevo.com`, port `587`, username (your Brevo SMTP login, ending in `@smtp-brevo.com`) and password (the SMTP key). Save. Keep the SMTP key private, like the database password.

Then change two templates on the same **Emails** page:

1. Open **Authentication**, then **Emails** (under Notifications in the left menu). Use the **Templates** tab if one shows.
2. Open **Magic link or OTP**. Set the subject to `Your Billr code` and replace the body with:

   ```html
   <h2>Your Billr code</h2>
   <p>Enter this code in the Billr app to sign in:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>If you did not ask for this, you can ignore this email.</p>
   ```

3. Save, then do the same for **Confirm signup**. A person's first sign-in uses that template.

## 4. Send Claude the two connection values

Open **Project Settings**, then **API Keys** (on older dashboards, **API**). Copy:

- **Project URL**, which looks like `https://abcdefghijkl.supabase.co` (also shown on the project's home page)
- The **publishable** key (on older dashboards, the **anon public** key)

Paste both into the Billr thread. These two values are designed to sit inside the app, and the row-level security from step 2 protects the data.

Never share the **secret** key or the **service_role** key, and never put them in the app. They bypass all security.

## Limits to know about

- **Spam folder:** codes sent through Brevo from a Gmail or Yahoo address may land in spam at first. Sending from your own domain fixes that later.
- **Phone sign-in** (the build plan's choice) needs a paid SMS provider. It can replace the email code later without changing how backup works.
