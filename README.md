# Harness Migration Portal

Tracks the migration of Applications (and their Repos) into Harness, backed by Postgres, with Excel/CSV import, a reporting dashboard, and stage-change email notifications.

## Data model

- **Wave** — one row per planned migration wave (`number` 1-4), with overall `targetStartDate`, `targetDate` (end) and `proposedTargetDate`.
- **Application** — `appId` (business key), `name`, `owner`, `teamContact`, `status` (ACTIVE/ARCHIVED), `wave` (required), its own `targetStartDate`/`targetDate`/`proposedTargetDate`, current phase (`migrationStatus`), and actual start/end dates for each phase.
- **Repo** — belongs to an Application. `name`, `sourceUrl` (mandatory), `targetProject`, `status`, `cleanupDecision`, `startedAt`/`completedAt`.
- **StatusHistory** — one row per repo status change, with the reason where one was required.
- **Issue** — blockers/issues logged against a repo.
- **Recipient** — per-application list of email recipients.
- **EmailTemplate** — one editable template per application event, with `{{placeholder}}` substitution.
- **EmailLog** — audit trail of every email sent (AUTO or MANUAL trigger, SENT/FAILED).

## Workflow

```
Application: Not started → Cleanup → Migration → Validation → Adoption → Complete
                              └─ or Archived (with all its repos)
Repo:        Not started → Migrating → Migrated → Validating → Validated → Adopted, or Archived
```

| Phase | Starts when | Ends when |
|---|---|---|
| Cleanup (manual) | Someone starts it | Someone ends it, after every active repo is marked Keep or Archive |
| Migration | First repo is Migrating or beyond | All active repos are Migrated or beyond |
| Validation | First repo is Validating or beyond | All active repos are Validated or beyond |
| Adoption | First repo is Adopted | All active repos are Adopted, which makes the application Complete |

The rules live in `server/src/lib/workflow.ts` (tests: `docker compose exec server npm test`).

- **Current phase** is the earliest phase that hasn't ended. A person can override it with a reason; it then holds until returned to automatic.
- **Cleanup** decides what continues. Archive decisions on repos take effect when Cleanup ends. Archiving the whole application happens during Cleanup, or at any time if it has no active repos. It needs a reason, takes every repo with it, and can't be undone in the portal.
- **Inactive** means Archived: marking an application inactive, at any phase except Complete, archives it and all its repos after confirmation with a reason. Nothing stays Inactive, and it can't be set by upload or on a new application.
- **Reasons** are required for backward repo moves, archiving and un-archiving a repo, and overrides. A backward move, or adding a repo that is behind a finished phase, reopens the phase; its original start date is kept.
- **Warnings** flag an application, without blocking, when repos start migrating before Cleanup ends, its target dates fall outside its wave's, or Cleanup has ended with no active repos.

### Progress and health

- **Progress** is the average credit across active repos: Not started 0, Migrating 25, Migrated 50, Validating 65, Validated 80, Adopted 100. Archived repos and applications are left out and counted separately on the Dashboard. Wave progress averages its active applications.
- **Health**, checked in order: `ARCHIVED`; `COMPLETE`; `UNSCHEDULED` (no target end); `OVERDUE` (target end has passed); `AT_RISK` (target start has passed but Cleanup hasn't started, or within 14 days of target end and under 80%); otherwise `ON_TRACK`.

### Emails

Recipients get six kinds of email, all at application level:

1. **Cleanup started**, when Start Cleanup is clicked
2. **Migration started**, when the first repo starts migrating
3. **Validation started**, when the first repo starts validating
4. **Final notice**, when Adoption completes and the application is Complete
5. **Archived** and 6. **Phase overridden**, both including the reason

Finishing a phase, starting Adoption and reopening a phase are recorded as dates but send nothing. Notices are held while Cleanup is open: ending it sends the notice for wherever repos have reached, if any. Nothing is sent while an override is in place. One update that jumps several phases sends a single notice, for the furthest point. Completing again after a reopen sends the final notice again.

### Bulk actions

The Applications page can start Cleanup for, or archive, many applications at once. Each follows the same rules and sends the same emails as doing it individually, and any that don't qualify are left unchanged. One reason applies to everything archived together.

An application's page can set one status on many repos at once. The reason rule applies to each repo, and the whole update sends at most one email.

## Setup

```bash
cd server
cp .env.example .env                 # edit APP_BASE_URL / SMTP creds if not using the bundled services

cd ..
docker compose up -d --build         # postgres + server (migrates, seeds, and starts the API) + mailpit

cd client
npm install
npm run dev                          # SPA on http://localhost:5173
```

This brings up:
- **postgres** on `localhost:5432`
- **server** (the API) on `localhost:4000` — on first start it runs `prisma migrate deploy` and seeds any missing `EmailTemplate` rows automatically
- **mailpit** (local SMTP catcher) — web UI at `http://localhost:8025`, SMTP on `localhost:1025`

> **Why the server runs in Docker too:** on macOS, Docker Desktop's host↔VM port forwarding can silently break Prisma's Postgres connection (`P1010: User was denied access`) even though the same credentials work fine for `psql` or a raw TCP socket — it's specific to Prisma's wire-protocol handling over that forwarded port. Running the server inside the same docker-compose network (talking to `postgres:5432` directly, no host forwarding involved) avoids it entirely. If you'd rather run the server with `npm run dev` directly on the host, change `DATABASE_URL` in `.env` to use `localhost`, and know you may hit this issue.

To create a *new* migration after changing `prisma/schema.prisma`, run it against the same docker network rather than through the host-forwarded port:

```bash
docker compose exec server npx prisma migrate dev --name <description>
```

## Email

Mail goes to the local Mailpit catcher by default. Settings are in `server/.env`, and `server/.env.example` shows the Gmail values. Apply changes with `docker compose up -d --force-recreate server`.

- `EMAIL_REDIRECT_TO`: when set, all email goes to this one address, with the intended recipients shown in the subject. Use it while testing against a real mail server.
- `docker compose exec server npm run email:test -- you@example.com`: checks the connection and sends one test message, without touching application data.

## Sample data

`docker compose exec server npm run seed:scenarios` **deletes all applications, repos, issues, recipients and email logs**, then loads 28 applications covering every phase, health state, app status and repo status, plus archiving, Cleanup decisions, overrides, a reopened phase, each warning, edge cases (no repos, no recipients), issues, and sent and failed emails. It sends no email and leaves email templates untouched. Health depends on today's date, so re-run it to refresh the dates.

## Importing data

`POST /api/import` accepts one or more `.xlsx`/`.csv` files (field name `files`). Sheets/files are classified by name (`Applications` / `Repos`) or by header (`repoName` column ⇒ Repos sheet). Expected columns:

- Applications: `appId, name, owner, teamContact, status, wave, targetStartDate, targetDate, proposedTargetDate, cleanupStartedAt, cleanupEndedAt`. `status` can only be `ACTIVE`, because archiving and marking inactive happen in the portal. The Cleanup dates are for applications already past that point.
- Repos: `appId, repoName, sourceUrl, status, reason, cleanupDecision, targetProject, technology, technologyVersion, pipelineType, startedAt, completedAt, notes`. `reason` is required when archiving or moving a repo backward, and for `cleanupDecision=ARCHIVE`. `cleanupDecision` is accepted only while Cleanup is in progress.

`wave` is required for a new application; a blank `wave` on an existing one keeps its current wave.

New applications send no email; updates that change an existing application's phase do. Rows that break a rule are skipped and listed in the result.

Applications are upserted by `appId`; Repos are upserted by (`appId`, `repoName`). Applications in a batch are committed before Repos are processed, so a single upload can introduce an application and its repos together.
