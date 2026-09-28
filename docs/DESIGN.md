# Design notes

This covers the data analysis behind the schema, the main design decisions, and the pitfalls found while building. For setup and the API, see the [README](../README.md).

## 1. What the sheet contains

Every column of `data/sample.csv` was profiled before the schema was designed.

**Format.** The file has 1,198 data rows and 28 columns, in UTF-8 with CRLF line endings. Five rows quote a value because it contains a comma: `"The Bond Exchange, Inc."`, `"Kenneth Burton, Jr. & Ollie Monroe"` and `"Winston Salem,"`. Splitting lines on `,` would corrupt them, so the import uses a real RFC-4180 parser (csv-parse).

### Column mapping

Every column with at least one value is stored. The five always-empty columns are dropped. *Extra* marks fields beyond the brief's list.

| CSV column | Filled | Distinct | Stored as | Notes |
|---|---:|---:|---|---|
| `agent` | 1,198 | 3 | `agents.name` | |
| `userType` | 1,198 | 1 | `users.userType` | Always "Active Client" |
| `policy_mode` | 1,198 | 2 | `policies.policyMode` *(extra)* | Term in months (6 / 12); always equals end − start |
| `producer` | 1,198 | 50 | `policies.producer` *(extra)* | |
| `policy_number` | 1,198 | 1,198 | `policies.policyNumber` | Unique, so it's the natural key |
| `premium_amount_written` | 0 | — | dropped | |
| `premium_amount` | 1,198 | 962 | `policies.premiumAmount` *(extra)* | 100 to 133,736; total 3,339,088.92 |
| `policy_type` | 1,198 | 2 | `policies.policyType` *(extra)* | Single / Package |
| `company_name` | 1,198 | 46 | `carriers.companyName` | |
| `category_name` | 1,198 | 19 | `lobs.categoryName` | |
| `policy_start_date` | 1,198 | 344 | `policies.policyStartDate` | ISO `YYYY-MM-DD` |
| `policy_end_date` | 1,198 | 316 | `policies.policyEndDate` | Never before the start date |
| `csr` | 1,198 | 66 | `policies.csr` *(extra)* | |
| `account_name` | 1,198 | 1,193 | `accounts.accountName` | 5 names shared by two different people |
| `email` | 1,198 | 1,149 | `users.email` | Not unique per person |
| `gender` | 735 | 2 | `users.gender` | Blank on every Commercial row |
| `firstname` | 1,198 | 1,198 | `users.firstName` | Holds the full name, e.g. "Lura Lucca" |
| `city` | 1,180 | 96 | `users.city` *(extra)* | |
| `account_type` | 1,198 | 2 | `accounts.accountType` *(extra)* | Personal / Commercial |
| `phone` | 1,198 | 1,064 | `users.phone` + `phoneExtension` *(extra)* | |
| `address` / `state` / `zip` | 1,180 | — | `users.*` | 18 rows have no address block at all |
| `dob` | 1,198 | 402 | `users.dob` | 1930 to 1999 |
| `primary`, `Applicant ID`, `agency_id`, `hasActive ClientPolicy` | 0 | — | dropped | |

### Findings that shaped the design

| Finding | Evidence | Consequence |
|---|---|---|
| `email` doesn't identify a person | `eidac@hotmail.com` belongs to Cynthia Peters, Casey Fucci and Minh Lovering, who have different DOBs and phones; 47 addresses are shared like this | User key = `firstName + email` |
| `phone` doesn't identify a person | 62 numbers are shared (office lines), e.g. `(336) 768-1433` on 9 rows | Stored, never used as a key |
| Account names are shared | Rows 102–106 reuse the account names from rows 2–6 for different people | Account key = `userId + accountName` |
| One policy per person | No person appears twice | The aggregation still groups generically; a test adds a user with three policies |
| Mixed phone formats | 923 × `8677356559`, 269 × `(336) 245-8310`, 6 × `(336) 761-8572 Ext.0012` | 10 digits + separate extension |
| Placeholder ZIPs | 3 × `27104-____` | Suffix stripped; ZIP kept as a string (ZIP+4) |
| City noise | 3 × `Winston Salem,`; mixed casing | Trailing comma stripped; casing kept |
| Carrier `_Copy` twins | 6 names like `Nationwide Mut Ins Co_Copy` next to `Nationwide Mut Ins Co` | Kept distinct (46); merging would give 40 |
| Dates are clean | Every date is `YYYY-MM-DD`; end ≥ start | Parsed strictly; impossible dates are rejected, not rolled over |

`Applicant ID` would be the ideal user key, but it's empty in every row.

## 2. Decisions

### Task 1.1: import

- **What runs on the worker thread.** The whole import runs there: parsing, normalising and writing. Only the multipart streaming to a temp file happens on the main thread. One worker per upload, capped by `IMPORT_MAX_CONCURRENCY`, with a memory limit (`resourceLimits`) and a timeout.
- **Idempotency instead of transactions.** Unique natural keys plus `bulkWrite` upserts mean a half-finished import is repaired by uploading again. Multi-document transactions would also require a replica set. If a concurrent import races on a new key (`E11000`), `bulkUpsert` retries the batch once, and the second pass matches.
- **Reading ids back.** `bulkWrite` only reports the `_id`s of inserted documents, so each batch is read back by key to resolve the ids that policies reference. Reference collections (agents, LOBs, carriers) are resolved once per job from a cache.
- **One normaliser for both formats.** CSV and XLSX readers both yield string records. XLSX dates are read as numeric serials and converted with `XLSX.SSF.parse_date_code`.
- **SheetJS from its CDN.** SheetJS is installed from `cdn.sheetjs.com` (0.20.3). The npm registry copy is stuck at 0.18.5, which has known advisories, and uploads are untrusted input.

### Task 1.2 / 1.3: search and aggregation

- **Search.** It resolves users by an escaped, case-insensitive regex on `firstName`, then pages through their policies with `populate`. At 1,198 users the unanchored regex is a trivial scan. At scale you'd use a lowercase field with an anchored prefix, or Atlas Search.
- **Aggregation.** It's a single pipeline. It sorts by policy count, then name, under a case-insensitive collation, and pages with `$facet`. `totalPremium` is rounded with `$round`; real money would use `Decimal128` or integer cents.

### Task 2.1: CPU monitor

- **Per core, not machine-wide.** On an 8-core machine, a completely pegged Node process reads 100 % per core but only 12.5 % machine-wide, so a machine-wide 70 % rule would never trigger. `/health` shows both.
- **The decision runs in another process.** A blocked event loop can't run a `setInterval`, so a self-monitor misses exactly the case it exists for. The cluster primary does no HTTP or DB work and is always responsive.
- **Two signals.**
  - Sustained CPU ≥ 70 % (3 samples) catches a busy but still-responsive server; it's replaced gracefully.
  - A missing heartbeat (5 s) catches a frozen event loop, which can't even report; it's killed.
- **Zero-downtime replacement.** The replacement is forked first, and the old worker is retired only after the new one is listening on the shared port. Graceful shutdown uses IPC, because `SIGTERM` terminates a Windows process without running handlers.
- **Guard rails.** The first seconds after a fork are ignored (warm-up), and a restart budget prevents restart storms under genuine sustained load.
- **Import CPU counts too.** `process.cpuUsage()` covers every thread, including import workers. The sample import finishes well inside the 3-sample window. To exclude imports entirely, Node 24's `process.threadCpuUsage()` measures the main thread alone.

### Task 2.2: scheduled messages

- **Durable, not in-memory.** Jobs survive restarts, which Task 2.1 causes on purpose. `setTimeout` would also fire immediately for delays over 2³¹−1 ms (~24.8 days).
- **Exactly one message per job.** An atomic claim (`findOneAndUpdate` → `processing`), a unique `messages.scheduledMessageId`, and stale-lock recovery (`SCHEDULER_LOCK_TTL_MS`) together guarantee it. This holds with several server processes and across crashes.
- **Time zones.** Luxon validates the calendar strictly and handles DST: a wall time inside a spring-forward gap moves forward. The response echoes the resolved UTC `runAt`, so the client sees exactly when the message will be inserted.
- **Considered alternatives.** Agenda (MongoDB-backed) would work too. The dispatcher is small enough that keeping its guarantees visible was preferred over another dependency.

### Architecture

The layout follows the team's NestJS + Fastify service blueprint:

- modules, each with controller → service → repository
- a thin `common/` layer: schemas, repositories, pipes, filters, interceptor, logger
- the `{ status, code, msg, data }` envelope
- one config service, the only reader of `process.env`
- pino logging
- helmet, and a CORS allow-list that is never `*`

The blueprint's shared internal packages aren't used; the few pieces needed are implemented locally, so the repository stands alone.

## 3. Pitfalls found while building

1. **Naive CSV splitting.** `line.split(',')` corrupts the 5 quoted rows.
2. **Impossible dates roll over.** `new Date('2019-02-30')` silently becomes 2 March, so dates are validated with a round trip.
3. **XLSX dates shift a day east of UTC.** SheetJS `cellDates` + `toISOString()` moves every date back one day in Asia/Kolkata (tested: all 1,198 rows). The `dateNF` option doesn't help either; you get `2/11/60`.
4. **`npm i xlsx` installs a stale release.** It's 0.18.5; install from `cdn.sheetjs.com` instead.
5. **Plain JavaScript has no parameter metadata.** A global `ValidationPipe` silently validates nothing; each handler binds its DTO with `expectedType`.
6. **NestJS 12 is ESM-only.** This CommonJS JavaScript service stays on NestJS 11.
7. **MongoDB driver 7 under Jest.** The driver loads `os` via dynamic `import()`. Jest's CommonJS sandbox only supports that with `--experimental-vm-modules`; without it the handshake metadata is incomplete and `mongod` rejects the connection. The `package.json` test scripts pass the flag.
11. **pnpm 11 blocks dependency install scripts.** `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` until each one is decided in `pnpm-workspace.yaml` (`allowBuilds`). Only `mongodb-memory-server` (downloads the test MongoDB binary) is allowed. Jest's `@parcel/watcher` and `unrs-resolver` are denied, since their prebuilt native binaries are installed anyway.
8. **Replying mid-upload resets the connection.** Rejecting an upload before reading it fully makes the client see `ECONNRESET` instead of the 400, so the upload is drained first.
9. **Windows signals.** `SIGTERM` doesn't run handlers on Windows, so the supervisor asks workers to stop over IPC.
10. **nodemon doesn't restart a crashed process.** It waits for file changes, which is why the restart logic lives in the cluster primary.
