# Setting up StageFlow Cloud: web app, team and dancer portal

StageFlow Cloud lets **your team of choreographers** sign in and work on the same sets, from the web app (`…github.io/stageflow/app/`) or the desktop app, at any time. **Only people on your team list get in.** **Dancers never need an account**: each set gets a private, view-only **dancer portal** link for phones.

The cloud part runs on a free [Supabase](https://supabase.com) project that **you** own. You set it up once (about 15 minutes), then everyone on your team signs in with an emailed code.

## 1. Create the Supabase project
1. Sign up at <https://supabase.com> and click **New project**.
2. Pick a name (e.g. `stageflow`) and a region near you. Save the database password somewhere safe; StageFlow doesn't need it.
3. Wait a minute while the project starts.

## 2. Create the tables and security rules
1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`cloud/schema.sql`](../cloud/schema.sql) and click **Run**.

It creates the tables (sets, segments, your team, dancer links, your rosters) and a private bucket for music. It also adds the rules that only let **people on your team** see or change anything, and lets dancer links read formations, but nothing else, without signing in. Run it again after each StageFlow update that mentions it; that's safe.

## 3. Make sign-in emails work
StageFlow signs people in with a **6-digit code** sent by email, so there are no passwords.

1. **Connect an email service.** Supabase's built-in email only delivers to people on *your* Supabase team, and only a few messages per hour. To let co-choreographers sign in, connect a free email service under **Authentication → Emails → SMTP Settings**. [Resend](https://resend.com/blog/how-to-configure-supabase-to-send-emails-from-your-domain) and [Brevo](https://developers.brevo.com/docs/supabase-smtp-integration) both have free plans and guides for Supabase.
   - Then raise the limit under **Authentication → Rate Limits** if many people sign in at once.
   - If it's only you, you can skip this at first.
2. **Put the code in the email.** Under **Authentication → Emails → Templates**, edit the **Magic Link** template so it shows the code, for example:
   ```html
   <h2>Your StageFlow code</h2>
   <p>Enter this code in StageFlow to sign in:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   ```
   - Make the same change to the **Confirm signup** template, which first-time users can receive.
   - If Supabase says templates can only be edited with a custom email service on your plan, do step 1 first.
3. Leave **Authentication → Sign In / Providers → Email** enabled; it is by default.

## 4. Connect StageFlow

**Easiest:** send the Project URL and publishable key (below) to whoever maintains your StageFlow repo, or add them yourself as `cloud.config.json` (see the end of this step). Then the web app, the dancer links and every desktop build connect by themselves.

1. In Supabase open **Project Settings → API Keys** (or **API**), and copy:
   - the **Project URL** (`https://xxxx.supabase.co`), and
   - the **publishable key** (`sb_publishable_…`), or the legacy **anon** key (`eyJ…`).

   Never use the *secret* / *service_role* key in the app.
2. In StageFlow click **Sign in** (top-right) and paste both into **Connect**.
3. Enter your email, then type the code you receive. You're in.

**Make it automatic for your whole team (optional):** add a file named `cloud.config.json` to the root of the StageFlow repo, then push. Every build made from your repo then connects to your project by itself:
```json
{ "url": "https://xxxx.supabase.co", "key": "sb_publishable_…" }
```
The publishable key is designed to be public. The security rules from step 2 keep every set private to its owner and invited choreographers.

## 5. Become the admin and add your team
1. Open the web app, `https://<your-github-name>.github.io/stageflow/app/` (or the desktop app), and **sign in first**, before anyone else, so the admin is you.
2. In the account window click **Become the admin**.
3. Under **Your team**, add the email of each person who may use StageFlow. Tick *Admin* for anyone else who should be able to add or remove people.
4. They open the same web address and sign in with that email. Anyone not on the list can't see or create anything.

## 6. Dancer portal
On a set card, click **Share** → **Get the dancer link**. Copy the link (or let dancers scan the QR code). It opens on any phone with no account, shows every segment of the set, and is view-only. **New link** replaces it (the old one stops working); **Turn off** disables it.

## Using it
- **Web app:** everything is in the cloud; there's nothing to upload. Teammates' changes appear within a few seconds.
- **Desktop app — upload a set:** Dashboard → set card → **Upload to cloud**. From then on it syncs automatically: when StageFlow opens, every 2 minutes, and a moment after you save. Click the **Synced** badge to sync right away.
- **Another computer:** sign in with the same email. Your sets appear under **In the cloud**; click **Download**. Your rosters and dance styles come with your account.
- **Who can edit:** everyone on your team can open and edit every set. Only the person who made a set (or an admin) can delete it from the cloud. Removing someone from the team takes their access away straight away.
- **Working offline:** keep working; it syncs when you're back online.
- **Editing the same segment on two devices:**
  - Nothing is lost. The other version goes in the original segment, and yours is kept next to it as "*name* (my edits)". Pick the one you want and delete the other.
  - A segment that's open with unsaved changes is never overwritten. If it changed somewhere else and you have no unsaved changes, it reloads with a notice.
- **Deleting:** removing a segment removes it for everyone. The local file goes to the recycle bin / trash, so it can be recovered.
- **Stop syncing a set on one computer:** the ✕ next to Share. Your files stay; the cloud copy stays for others.

## Free plan notes
- The Supabase free plan gives about 500 MB of data and 1 GB of file storage. A typical song is 3–8 MB, so roughly 150–300 songs.
- Free projects **pause after about a week with no use**. Open the Supabase dashboard and click *Restore* to wake one up, or use the Pro plan to keep it always on.
- Check [supabase.com/pricing](https://supabase.com/pricing) for current limits.

## Testing locally (developers)
The same schema runs on a local Supabase: `npx supabase start`, then apply `cloud/schema.sql` with `psql`. Start StageFlow with
`STAGEFLOW_CLOUD_URL=http://127.0.0.1:54321 STAGEFLOW_CLOUD_KEY=<publishable key>` to point it there. Sign-in codes appear in the local mail viewer (Mailpit) at <http://127.0.0.1:54324>.
