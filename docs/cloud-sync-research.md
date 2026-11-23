# StageFlow on several devices, one account — research

*November 2026. Prices and free-tier limits change often. The numbers below come from the sources listed at the end, several of them third-party write-ups, so check each provider's pricing page before committing.*

## The short answer

1. **Today, with no new code:** move the StageFlow library into a cloud-synced folder (OneDrive, Google Drive, Dropbox or iCloud Drive). Then point every computer at it: Dashboard → *Library: Change…*. Your sets, segments and rosters follow you between your Windows and Mac machines. There's no sign-in inside StageFlow; the cloud drive's own account does the syncing.
2. **The real thing, with accounts:** add **Supabase** as the backend.
   - **Sign-in:** Google, Apple, or an email link, in the desktop app and on phones.
   - **Data:** sets, segments and rosters live in a database; music files live in storage.
   - **Offline:** each device keeps a local copy and works offline.
   - **Cost:** the free tier comfortably covers one choreographer or a small team. The paid plan is about $25/month if you outgrow it.
   - **Effort:** roughly 2–3 weeks to build, including offline handling and conflicts.
3. **Later, if you want two people editing the same segment at the same moment** (live, Google-Docs-style), layer a CRDT sync library (Yjs or Automerge) on top. It's not needed for "my laptop and my desktop".

## What has to sync

| Data | Where it lives now | Size | Notes |
| --- | --- | --- | --- |
| Segments (`*.stageflow`) | `Documents/StageFlow/<Set>/` | Tens of KB of formations, plus the music embedded as base64 (a 4 MB MP3 adds ~5.4 MB) | Music should become a separate file in the cloud, not part of the segment record. |
| Set info (`set.json`) | Each set folder | Tiny | Running order, linked roster. |
| Rosters, dance styles (`rosters.json`) | Library root | Tiny | Shared by all sets. |
| Move clips (pose data) | Inside segments | ~0.3–1 MB per clip | Also better stored as separate files. |
| Phone viewer | Data packed into the share link | — | With an account, links could point at a cloud copy instead. That would allow music in the viewer and live updates. |

Usage pattern: usually one choreographer, sometimes on two machines, occasionally a co-choreographer. Editing at rehearsal spaces with poor wifi is common, so **offline must keep working**.

## Options compared

### 1. Cloud-synced folder (OneDrive / Google Drive / Dropbox / iCloud)
- **How:** put the library folder inside the synced folder and choose it with *Library → Change…* on each computer. This works in StageFlow today.
- **Pros:** free, nothing to build, no account inside StageFlow. Version history comes from the drive.
- **Cons:**
  - Editing the same segment on two machines before the drive syncs creates a "conflicted copy" file.
  - "Files On-Demand" or online-only placeholders can mean a file isn't downloaded yet when StageFlow opens it.
  - Microsoft doesn't support symlinks or junctions inside OneDrive.
  - No phone access, and no shared account for a team.
- **Small improvements worth making:** warn when a segment changed on disk since it was opened, and show the drive's "conflicted copy" files on the dashboard.

### 2. Supabase (recommended for accounts)
- **What you get:**
  - **Auth:** Google, Apple, email magic link and more.
  - **Database:** Postgres, where formations can sit as JSON.
  - **Storage:** for music and clips.
  - **Realtime:** change notifications, which can tell the other device "this segment changed".
- **Free tier (third-party sources):**
  - 50,000 monthly active users
  - 500 MB database
  - 1 GB file storage
  - 5 GB egress a month
  - 2 projects
  - The project pauses after ~1 week with no activity.
- **Paid tier:** Pro is $25/month.
- **Why it fits StageFlow:**
  - Formations are structured JSON, which Postgres stores well, and row-level security makes "only my sets" simple.
  - It's open source, so there's an exit path: you can self-host later.
- **Watch out for:** free projects pausing when nobody uses them for a week, and the 1 GB storage limit if every segment carries a song (around 150–200 songs).

### 3. Firebase (Google)
- **What you get:** Auth, the Firestore document database, Cloud Storage and Hosting.
- **Free (Spark) tier:**
  - Firestore: 1 GiB stored, 50,000 reads and 20,000 writes a day.
  - Auth: generous.
  - Cloud Storage: may need the pay-as-you-go Blaze plan. The pricing table lists Spark as "not applicable" for Storage, so check before relying on it.
- **Fit:** good. Firestore documents are capped at 1 MiB, though, so music and clips must live in Storage, which may push you onto Blaze. It's also more vendor lock-in than Supabase.

### 4. PocketBase (self-hosted)
- **What it is:** a single program that includes auth (including OAuth), a database (SQLite), file storage and realtime.
- **Cost:** a ~$5–6/month small server.
- **Fit:** great value and simple, but **you run a server**: updates, backups, uptime. Writes go through SQLite's single writer, which is fine at this scale.

### 5. Cloudflare (Workers + D1 + R2)
- **Free tier:**
  - D1 database: 5 GB, 5M row reads and 100k writes a day.
  - R2 storage: 10 GB, with no egress fees.
  - Workers: 100k requests a day.
- **Fit:** the cheapest storage for lots of music. But you write the API yourself, and **sign-in is not included**; you'd add something like Better Auth or Clerk. That's more building than Supabase.

### 6. Local-first sync (Yjs / Automerge + a sync server)
- **What it is:** every device keeps a full replica and merges changes automatically (CRDTs). This is the strongest model for offline use and true live co-editing.
- **Cost of building:** the most engineering. You still need accounts and a server on top (any of the options above can host it).
- **Advice from the field:** ship a plain server sync first, and add local-first only once offline merging is itself the feature.

## Sign-in inside the desktop app (applies to every option)

The standard for native apps is RFC 8252, "OAuth 2.0 for Native Apps":
- **Use the system browser, not a login window inside the app.** StageFlow opens the user's browser for Google, Apple or email sign-in.
- **Use PKCE.** Desktop apps can't keep a client secret, and PKCE replaces it.
- **Send the browser back to the app** either through a registered link (`stageflow://auth-callback`) or a temporary `http://127.0.0.1:<port>` listener.
- **Store the session token with Electron's `safeStorage`,** in the main process only.
- **On phones,** the viewer page uses the provider's normal web sign-in.

Supabase, Clerk and Better Auth all document this Electron flow.

## How syncing would work (proposed design, Supabase)

```
profiles(id, display_name)
sets(id, owner_id, name, roster_id, order[], updated_at, version)
segments(id, set_id, owner_id, name, data jsonb, audio_path, updated_at, version)
rosters(id, owner_id, name, members jsonb, updated_at)
styles(id, owner_id, name)
set_members(set_id, user_id, role)      -- share a set with a co-choreographer
storage: audio/<owner>/<segment>.mp3, clips/<owner>/<clip>.json
```

- **Local first, cloud second.** StageFlow keeps writing the same files in the library folder, so offline works exactly as now. A sync service in the main process uploads changed files and downloads newer ones.
- **Change detection.** Each record carries `version` and `updated_at`. An upload says "I edited version 7"; if the cloud is already at 8, that's a conflict.
- **Conflicts.** Keep both: the incoming copy is saved as "Segment (from Laptop)" and the dashboard flags it, like the drive-folder behaviour but explicit. With one person on two devices this is rare.
- **Music.** Uploaded once and referenced by path, so segments stay small. Downloaded on demand and cached.
- **Phone viewer.** A share link becomes `…/stageflow/#seg=<id>&k=<token>`, pointing at a read-only cloud copy. That makes it short, updatable after sending, and able to include music. The current self-contained links keep working.
- **Realtime.** Optional. A subscription on `segments` tells an open editor that a newer version exists, so it can offer to reload.

## Rough effort (Supabase path)

| Piece | Effort |
| --- | --- |
| Supabase project, tables, row-level security, storage buckets | 1–2 days |
| Desktop sign-in (system browser + PKCE + `stageflow://` link), session storage, sign-out | 2–3 days |
| Sync service: upload/download, versions, conflict copies, offline queue, progress UI | 5–7 days |
| Music and clips moved to storage, with migration of existing segments | 1–2 days |
| Dashboard: "Synced / Offline / Conflict" badges, account menu, share-with-co-choreographer | 2–3 days |
| Phone viewer: cloud links (optional sign-in for dancers) | 1–2 days |
| **Total** | **~2–3 weeks** |

## Questions to decide before building

1. **Who signs in?** Only you? You plus co-choreographers? Should dancers sign in too, or keep using links?
2. **Live co-editing:** do two people ever need to edit the same segment at the same moment? (Yes means the CRDT option later.)
3. **Budget:** is a free tier that pauses after a week of no use acceptable, or is ~$25/month fine for always-on?
4. **Where should music live:** in the cloud (easy across devices), or only on your computers (smaller footprint)?
5. **Which sign-in options:** Google, Apple (needed for iPhone-heavy teams), email link?

## Sources

- Supabase free tier: [DEV Community — Supabase free tier limits in 2026](https://dev.to/mahdi_benrhouma_fe1c6005/supabase-free-tier-limits-in-2026-what-you-actually-get-and-when-you-will-hit-them-4mhe), [Schematic — Supabase pricing](https://schematichq.com/blog/supabase-pricing), [Automation Atlas — Supabase free tier limits 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/), [UI Bakery — Supabase pricing](https://uibakery.io/blog/supabase-pricing)
- Firebase: [Firebase pricing plans (docs)](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Firebase pricing](https://firebase.google.com/pricing/?hl=en)
- Desktop sign-in: [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/rfc8252/), [OpenReplay — Add authentication to an Electron app](https://blog.openreplay.com/add-authentication-electron-app/), [Clerk — OAuth deep links for Electron](https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links.md), [Nylas — desktop OAuth](https://developer.nylas.com/docs/cookbook/use-cases/build/desktop-oauth/), [Better Auth — Electron integration](https://better-auth.com/docs/integrations/electron), [WorkOS — Electron AuthKit example](https://github.com/workos/electron-authkit-example)
- Local-first / CRDTs: [DevToolLab — local-first apps & sync engines](https://devtoollab.com/blog/local-first-apps-crdt-sync-engine-guide), [DEV Community — CRDTs for offline-first sync](https://dev.to/software_mvp-factory/crdts-for-offline-first-mobile-sync-1mja), [Convex — Automerge and Convex](https://stack.convex.dev/automerge-and-convex), [AFFiNE — local-first](https://mintlify.com/toeverything/AFFiNE/features/local-first), [Liveblocks — how sync engines work](https://liveblocks.io/blog/understanding-sync-engines-how-figma-linear-and-google-docs-work)
- PocketBase: [Better Stack — PocketBase backend guide](https://betterstack.com/community/guides/database-platforms/pocketbase-backend/), [DEV Community — PocketBase vs Supabase](https://dev.to/truongandev/pocketbase-vs-supabase-which-backend-wins-in-2026-55ab), [Encore — PocketBase alternatives](https://encore.dev/articles/pocketbase-alternatives)
- Cloudflare: [R2 pricing (docs)](https://developers.cloudflare.com/r2/pricing), [Workers pricing](https://workers.cloudflare.com/pricing/.md), [Cloudflare plans](https://www.cloudflare.com/plans.md)
- Synced folders: [Microsoft — OneDrive restrictions and limitations](https://support.microsoft.com/en-us/help/3125202), [Microsoft Tech Community — Files On-Demand for macOS](https://techcommunity.microsoft.com/t5/onedrive-for-business/files-on-demand-for-macos-qa/m-p/3101140), [WPS — OneDrive & Google Drive sync conflicts](https://www.wps.com/office-quick-solution/document-file-issues/stop-onedrive-and-google-drive-from-deleting-shared-files/)
