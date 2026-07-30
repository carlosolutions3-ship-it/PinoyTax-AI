# Backup & Restore Runbook

This document covers backing up and restoring PinoyTax AI's stateful data: the
PostgreSQL database and the S3-compatible document vault. Redis and RabbitMQ
hold no data that isn't reconstructible or safely lost (cache and in-flight
job queues respectively) and are not covered here.

The data in this database includes BIR filings, payroll records, and other
PII/financial data for real businesses — treat backups with the same access
controls as production credentials, not as routine build artifacts.

## 1. What to back up

| Store | Contains | Backup approach |
|---|---|---|
| PostgreSQL | All 10 schemas (`identity`, `org`, `payroll`, `tax_engine`, `compliance`, `forms`, `documents`, `ai`, `notifications`, `audit`) | Full logical dump (`pg_dump`), see §3 |
| S3 document vault | Uploaded documents (BIR forms, payroll exports, attachments) referenced by rows in the `documents` schema | Bucket versioning + replication, see §5 |
| Redis | Access-token blocklist entries, rate-limit counters, job locks | Not backed up — entirely reconstructible; worst case is a short window of relaxed rate limiting after a cold start |
| RabbitMQ | In-flight background jobs (deadline reminders, notification sends) | Not backed up — jobs are re-enqueued by their own schedules (see `notifications-scheduling.module.ts`); a lost queue delays a job, it doesn't lose data |

The database and the document vault are the only two stores where losing
data is unrecoverable, and they must be backed up **consistently with each
other** — a restored database can reference document IDs that don't exist
in a document vault restored from a different point in time, and vice
versa. Note the timestamp of whichever backup is older when restoring both.

## 2. Managed Postgres (recommended for production)

If you provisioned managed Postgres per `DEPLOYMENT.md` §2, use the
provider's built-in automated backups and point-in-time recovery (PITR)
instead of the manual `pg_dump` approach in §3 — it will be more reliable,
support restoring to a rather than a fixed checkpoint, and won't need a cron
job you maintain yourself. Configure:

- **Automated daily snapshots**, retained at least 30 days.
- **Point-in-time recovery** enabled, with a WAL retention window covering
  at least your target RPO (recovery point objective — how much data loss is
  acceptable; for financial/compliance data, aim for minutes, not hours).
- **Cross-region replica or cross-region snapshot copy**, so a regional
  outage doesn't take out both the primary and its backups.

Test the provider's restore flow at least once before going live (see §6) —
an automated backup that has never been restored is unverified, not backed up.

## 3. Self-hosted Postgres (Docker Compose) — manual backup

If running the `postgres` container from `docker-compose.yml` directly
(not recommended for production — see `DEPLOYMENT.md` §2 — but documented
here since the repo ships that path by default):

### 3.1 One-off dump

```bash
docker exec pinoytax_postgres pg_dump \
  -U pinoytax -d pinoytax_ai --format=custom --file=/tmp/pinoytax_ai.dump
docker cp pinoytax_postgres:/tmp/pinoytax_ai.dump ./pinoytax_ai_$(date +%Y%m%d_%H%M%S).dump
docker exec pinoytax_postgres rm /tmp/pinoytax_ai.dump
```

`--format=custom` is used deliberately over a plain SQL dump — it compresses,
supports parallel restore (`pg_restore --jobs`), and lets you restore a
single schema or table without replaying the whole file.

### 3.2 Scheduled backups

Run the dump above on a schedule (cron, systemd timer, or a scheduled CI job)
and ship the resulting file off the host immediately — a backup that lives
on the same disk as the database it backs up doesn't survive a disk failure.
A minimal daily cron entry:

```cron
0 2 * * * /path/to/pinoytax-backup.sh >> /var/log/pinoytax-backup.log 2>&1
```

Where `pinoytax-backup.sh` performs the dump, uploads it to an S3 bucket
(a **separate** bucket or prefix from the document vault, so a single
misconfigured lifecycle rule can't delete both), and prunes local copies
older than a day. Encrypt the dump at rest (S3 server-side encryption is
sufficient) and restrict bucket access to the same principals who'd have
direct database access — a dump file bypasses row-level security entirely.

### 3.3 Retention

A reasonable starting policy, adjust to your compliance requirements (BIR
recordkeeping expectations may require longer retention than infrastructure
defaults):

- Daily dumps retained 30 days
- Weekly dumps retained 90 days
- Monthly dumps retained 1 year

## 4. Restoring PostgreSQL

### 4.1 Restore into a fresh database (disaster recovery)

```bash
# Create a fresh target database first — pg_restore does not create it.
docker exec pinoytax_postgres createdb -U pinoytax pinoytax_ai_restore

docker cp ./pinoytax_ai_20260101_020000.dump pinoytax_postgres:/tmp/restore.dump
docker exec pinoytax_postgres pg_restore \
  -U pinoytax -d pinoytax_ai_restore --no-owner --no-privileges /tmp/restore.dump
```

`--no-owner --no-privileges` is important if the dump was taken with a
different role than the one performing the restore (e.g. dumped as
`pinoytax`, restored where only `pinoytax_app` exists) — otherwise
`pg_restore` will fail trying to `ALTER OWNER` to a role that isn't present
in the target.

Verify the restore before cutting traffic over:

```bash
docker exec pinoytax_postgres psql -U pinoytax -d pinoytax_ai_restore -c \
  "SELECT schemaname, count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') GROUP BY schemaname ORDER BY 1;"
```

Confirm all 10 application schemas are present with a non-zero table count
matching what you expect, then run the app's own migration-status check:

```bash
cd apps/api && npx prisma migrate status
```

Only after both checks pass, repoint `DATABASE_URL` at the restored database
(or rename databases so the restored one takes over the original name) and
restart the API.

### 4.2 Restoring a single schema or table

`pg_dump --format=custom` supports selective restore without touching
unrelated data — useful for recovering one accidentally-deleted table
without rolling back everything since the last backup:

```bash
pg_restore -U pinoytax -d pinoytax_ai --no-owner --schema=payroll /tmp/restore.dump
# or a single table:
pg_restore -U pinoytax -d pinoytax_ai --no-owner --table=payslips /tmp/restore.dump
```

Be aware this can violate foreign-key constraints if the referenced rows in
other schemas have since changed — prefer a full restore into a scratch
database (§4.1) and manually reconcile specific rows for anything beyond a
simple "this table got truncated by mistake" recovery.

### 4.3 Point-in-time recovery (managed Postgres)

Follow your provider's PITR restore flow (AWS RDS, GCP Cloud SQL, etc. all
expose "restore to a specific timestamp" as a console/CLI action that
creates a new instance). After it completes, run the same two verification
checks from §4.1 (schema/table counts, `prisma migrate status`) before
cutting over.

## 5. Document vault (S3) backup and restore

- **Enable bucket versioning** on the `S3_BUCKET` configured in
  `apps/api/.env` — this alone protects against accidental overwrites/deletes
  without any separate backup job, since every version stays retrievable
  until explicitly pruned by a lifecycle rule.
- **Enable cross-region replication** (or your provider's equivalent) for
  disaster recovery against a regional outage.
- **Restoring a deleted object**: with versioning enabled, deleting an
  object creates a delete marker rather than erasing history — remove the
  delete marker (or copy the prior version back over it) to undelete:

  ```bash
  aws s3api list-object-versions --bucket "$S3_BUCKET" --prefix "path/to/object"
  aws s3api delete-object --bucket "$S3_BUCKET" --key "path/to/object" --version-id <delete-marker-version-id>
  ```

- **Restoring the whole bucket** to a point in time is a cross-region-copy
  or `aws s3 sync` operation from a replica/backup bucket back into the
  primary — run this only alongside a matching-timestamp database restore
  (§1), since document rows in Postgres reference object keys that must
  actually exist in the bucket.

## 6. Rehearsing a restore

Do this before you need it for real, and repeat periodically (quarterly is
a reasonable cadence) — a backup nobody has ever restored is a hope, not a
plan:

1. Take a fresh backup using the real procedure (§2 or §3).
2. Restore it into a throwaway environment (a separate database/instance,
   never the production one).
3. Run `npx prisma migrate status` and the schema/table-count check (§4.1)
   against the restored copy.
4. Spot-check a handful of real rows across a few schemas (a company, its
   payroll runs, a tax computation) to confirm the data is intact and not
   just structurally present.
5. Note how long the whole exercise took — that's your actual recovery time,
   not an estimate, and it's what you should communicate as your RTO
   (recovery time objective) to anyone depending on this system's uptime.
6. Tear down the throwaway environment.

## 7. Incident checklist

When data loss or corruption is suspected in production:

1. **Stop writes if possible** (put the API in maintenance mode or scale it
   to zero) before investigating further — every write after the incident
   makes the restore point further from "now" and risks compounding the
   damage.
2. **Identify the last known-good point** — check `audit.audit_logs` (see
   `SECURITY.md` for its append-only guarantee) for the earliest suspicious
   activity, and use that timestamp to pick a restore point older than it.
3. **Restore into a scratch environment first** (§4.1/§4.3), never directly
   over production — verify the data is actually correct before cutting over.
4. **Cut over** once verified, then **resume writes**.
5. **Write up the incident** afterward: what was lost, the actual RPO/RTO
   achieved versus target, and any process gap that let it happen.
