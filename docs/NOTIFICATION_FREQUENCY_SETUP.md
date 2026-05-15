# Notification Frequency — Setup Guide

This feature lets each user pick how often they want push notifications per trip:

- **Frequent** — every event = 1 push (immediate)
- **Medium** — 1-minute batched summary
- **Low** — 5-minute batched summary
- **Off** — anomalies only (overdraft, duplicate, etc.)

Anomaly alerts always bypass these settings and send immediately.

---

## 1. Run the migration

In Supabase SQL editor, run:

```
supabase/migrations/019_notification_preferences.sql
```

This creates the `user_notification_preferences` and `notification_queue` tables with RLS policies.

---

## 2. Enable Postgres extensions

In Supabase dashboard → **Database → Extensions**, enable:

- `pg_cron` (scheduled jobs)
- `pg_net` (HTTP requests from SQL)

---

## 3. Generate a cron secret

Generate a random string (e.g. via terminal):

```bash
openssl rand -hex 32
```

Copy the output. You'll need it twice.

---

## 4. Add the secret to Vercel

Vercel dashboard → your project → **Settings → Environment Variables**:

| Name | Value | Environments |
|------|-------|-------------|
| `CRON_SECRET` | (paste your secret) | Production, Preview |

Then redeploy so the env var takes effect.

---

## 5. Schedule the cron job (hardcode the secret)

> **Note:** Supabase's Hobby plan doesn't allow `ALTER DATABASE SET app.*`,
> so we hardcode the secret directly inside the cron job. The secret never
> leaves Supabase + Vercel, both of which are private to you.

In Supabase SQL editor, run (replace BOTH placeholders with your real values):

```sql
SELECT cron.schedule(
  'flush-notification-queue',
  '* * * * *',  -- every minute
  $$
  SELECT net.http_post(
    url := 'https://YOUR_APP.vercel.app/api/cron/flush-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SECRET_HERE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Alternative: use Supabase Vault (more secure)

If you want to keep the secret out of the cron definition, store it in the Vault:

1. Supabase dashboard → **Project Settings → Vault → New secret**
2. Name: `cron_secret`, value: (paste hex string)
3. Use this SQL instead:

```sql
SELECT cron.schedule(
  'flush-notification-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_APP.vercel.app/api/cron/flush-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

## 7. Verify it's running

After 1-2 minutes, check the cron history:

```sql
SELECT
  jobid,
  start_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobname = 'flush-notification-queue'
ORDER BY start_time DESC
LIMIT 5;
```

You should see `succeeded` rows every minute.

You can also test the endpoint manually:

```bash
curl -X POST https://YOUR_APP.vercel.app/api/cron/flush-notifications \
  -H "Authorization: Bearer YOUR_SECRET"
```

Returns `{"flushed": 0, "message": "queue empty"}` if nothing's pending — that's good.

---

## How it works end-to-end

1. **User sets preference** in trip Settings → "Medium" (1-minute summary)
2. **Mac adds 3 expenses** in 30 seconds → 3 rows inserted into `notification_queue` for each recipient
3. **Cron runs at the next minute mark** → finds rows ≥60s old, groups by user×trip
4. **Coalesce logic** builds a summary payload:
   ```
   Title: "Japan 2025 — 3 updates"
   Body:  "• 3 expenses added"
   ```
5. **One push sent** per user (instead of 3)
6. **Queue rows marked delivered** so they don't fire again

---

## Stopping the cron

If you ever need to disable it:

```sql
SELECT cron.unschedule('flush-notification-queue');
```

---

## Cost notes (Hobby plan)

- Supabase `pg_cron` runs inside your Postgres — **free**
- `pg_net` HTTP calls — **free** within your DB's regular outbound budget
- Each cron tick = 1 row fetch + 0+ pushes — negligible CPU
- Web push delivery via FCM/APNs — **free**

No paid services required.
