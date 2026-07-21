# Fplit - Architecture & Design Decisions

This document explains how Fplit is built and, more importantly, *why* - the
reasoning behind the tech choices, the data model, the settlement algorithm,
and the trickier edge cases. It's meant to be readable end-to-end by an
engineer evaluating the codebase, or by anyone reviewing it as a portfolio
project.

## 1. What this project is

Fplit is a group expense-splitting app (Splitwise-style): a group of people
share expenses, the app tracks who owes whom, collapses that into the minimum
number of payments needed to settle up, and requires both sides to confirm a
payment before it counts as done.

The interesting engineering problem isn't CRUD - it's keeping a shared ledger
consistent as group membership and payment state change over time, without
ever letting the "who owes what" view go stale.

## 2. Tech stack, and why

| Layer      | Technology                              | Why                                                                                                    |
|------------|------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Frontend   | Next.js (App Router), TypeScript, Tailwind | Mobile-first, fast to iterate, type-safe end-to-end with the backend's DTOs.                            |
| Backend    | Node.js, Express, TypeScript             | A separate REST service (not Next.js API routes) - deliberately, see below.                              |
| Database   | PostgreSQL                               | Relational data (User-Group-Expense-Payment, multiple FKs) needs real transactions and referential integrity. |
| ORM        | Prisma                                    | Type-safe queries + a migration history that's readable one commit at a time.                             |
| Auth       | Custom email/password + JWT (`bcryptjs` + `jsonwebtoken`) | See §2.1.                                                                                                 |

**Why a separate backend instead of Next.js API routes?** The API was
designed up front as an independent, resource-oriented REST contract (Bearer
token auth, `snake_case` JSON, standard status codes). Building it as its own
service means dealing with real CORS, deployment, and auth concerns instead
of the ones Next.js hides from you - closer to how a production system with
a mobile client or multiple frontends would actually be split.

### 2.1 Auth: why hand-rolled instead of NextAuth/Clerk

A separate backend implies a separate identity story: the backend issues and
verifies its own JWTs rather than delegating to a frontend-coupled auth
library. Passwords are hashed with **bcryptjs** - the pure-JS implementation,
chosen specifically to avoid native-module build failures on Windows dev
machines and on Railway's build image (the native `bcrypt` package needs a
C++ toolchain at install time; `bcryptjs` doesn't).

Login doesn't leak whether an email exists: on a failed lookup, the handler
still runs `bcrypt.compare` against a fixed dummy hash before returning 401,
so a wrong-password response and a no-such-user response take the same code
path and the same time.

## 3. Backend layer structure

```
backend/src/
  index.ts          # process entry: loads .env, starts app.ts on PORT
  app.ts             # Express app: middleware + router mounting
  db.ts              # Prisma client singleton + health-check query
  middleware/
    auth.ts          # JWT verification (requireAuth) - sets req.userId
  lib/               # pure business logic, framework-independent, unit-testable
    checklist.ts       # balance computation + debt-simplification algorithm
    jwt.ts              # token sign/verify
    inviteConfig.ts     # invite-link activation window
    formatExpense.ts, formatGroup.ts, formatPayment.ts  # DB row → API shape
  routes/             # HTTP layer only - validation + authorization + Prisma calls;
                        # anything that computes something is delegated to lib/
    auth.ts, me.ts, groups.ts, inviteLinks.ts, payments.ts, notifications.ts, health.ts
```

The rule enforced by this split: `routes/` never contains a calculation.
Anything involving money (splits, balances, debt simplification) lives in
`lib/checklist.ts`, which has no Express or Prisma dependency and is tested
directly (`lib/checklist.qa-test.ts`) without spinning up a database.

### Request flow example - confirming a payment

```
Client
  → PATCH /payments/:id   (Authorization: Bearer <jwt>)
  → app.ts: express.json() + cors()
  → middleware/auth.ts: verify token → req.userId
  → routes/payments.ts: authorize (only the recipient may confirm)
                          → prisma.$transaction:
                              - pg_advisory_xact_lock(groupId)   [serializes concurrent
                                                                   confirmations for this group]
                              - update payment.status
                              - mark related notifications as read
                              - if CONFIRM: recompute balances; if everyone nets to 0,
                                close the group
  ← formatPayment(payment) as JSON
```

## 4. Data model

Money is stored as an **integer in minor units (kuruş/cents)**, never a
float - the standard fix for rounding drift in financial calculations.

```
User
 ├─ ownedGroups      : Group[]        (as owner)
 ├─ memberships      : GroupMember[]
 ├─ expensesPaid     : Expense[]      (as payer)
 ├─ expenseSplits    : ExpenseSplit[] (audit trail only - see §5)
 ├─ paymentsFrom/To  : Payment[]
 └─ notifications    : Notification[]

Group (status: ACTIVE | CLOSED)
 ├─ members     : GroupMember[]   (composite PK groupId+userId - DB-level guarantee
 │                                  against double-membership)
 ├─ inviteLinks : InviteLink[]    (status: PENDING | ACTIVE | EXPIRED)
 ├─ expenses    : Expense[]
 └─ payments    : Payment[]

Expense
 ├─ amountKurus, paidBy
 └─ splits : ExpenseSplit[]   (written, but not read - see §5)

Payment (status: PENDING_CONFIRMATION | CONFIRMED | REJECTED)
 ├─ fromUser, toUser, amountKurus
 ├─ rejectionReason / rejectionNote  (when REJECTED)
 └─ notifications : Notification[]

Notification
 └─ type: SETTLEMENT_CONFIRMATION_REQUEST, relatedPaymentId, isRead
```

**Core principle: the ledger is immutable, the checklist is not stored.**
`Expense` and `Payment` rows are permanent facts - things that happened.
"Who owes whom right now" is never one of those facts; it's a value
recomputed on every request from the Expense and CONFIRMED Payment rows. This
sidesteps an entire category of staleness bugs (see §5 and §6) by
construction: there's no cached "checklist" row that could ever disagree with
the ledger it's derived from.

## 5. Design decision: expense splits are time-independent, not frozen

This is the one real bug this project hit during manual testing, and the fix
it led to is the most interesting decision in the codebase.

**Original behavior (as first built):** when an expense was added, its split
was computed once against the group's member list *at that moment* and
written to `ExpenseSplit`. Every later read used those frozen rows.

**The bug:** a user added a $20 expense; about 15 seconds later, a new member
joined via invite link. The new member was never included in that $20
expense's split at all - the checklist only reflected their share of a later,
smaller expense. From the new member's point of view the numbers looked
arbitrary, and there was no way to tell from the UI why.

**The fix:** stop treating `ExpenseSplit` as a source of truth for anything.
`lib/checklist.ts::computeExpenseSplits` now recomputes every expense's split
on every read, against the group's *current* member list - not the list that
existed when the expense was created. `ExpenseSplit` rows are still written
for audit/history purposes, but no read path (`GET /groups/:id`, `GET
/:groupId/expenses`, `GET /:groupId/checklist`, `POST /:groupId/payments`)
touches them anymore.

**Consequence, stated plainly:** a member who joins a group late is treated
as a co-owner of every expense already in that group, including ones added
before they joined. This is a deliberate product decision (documented as
edge case #8 below), not an oversight - but it's also the kind of thing that
can surprise a user, so the UI surfaces it rather than hiding it.

Rounding rule (unaffected by the above): `base = floor(amount / member_count)`,
and the leftover cent goes to the payer's own share, so the split always sums
back to exactly the original amount.

## 6. Debt simplification (the checklist algorithm)

```
net_balance(U) = Σ(expenses U paid)
               − Σ(U's live-computed share, per §5, across every expense in the group)
               + Σ(CONFIRMED payments U sent)
               − Σ(CONFIRMED payments U received)
```

`PENDING_CONFIRMATION` payments are deliberately excluded from this sum -
only a payment both sides have agreed happened moves the balance. The
in-flight ones are surfaced separately, as a `pending_payment_id` on the
relevant checklist row (so the UI can show an "awaiting confirmation" badge
instead of silently changing someone's balance).

Given the resulting set of nonzero balances, a **greedy debt-simplification
algorithm** sorts debtors and creditors by magnitude, repeatedly matches the
largest debtor against the largest creditor, transfers `min(debt, credit)`
between them, and drops whichever side hits zero - collapsing what could be
an O(n²) web of IOUs into at most `member_count − 1` suggested transfers.

## 7. Payment settlement flow

A settlement can't be a single "pay" click, because money hasn't actually
moved anywhere the app can observe - so the flow is a two-sided confirmation:

1. **Debtor initiates** - `POST /groups/:groupId/payments`. The amount and
   `to_user` must match a checklist row *exactly*; there's no partial-payment
   support (see §8). A `Payment` in `PENDING_CONFIRMATION` and a
   `Notification` for the recipient are created in one transaction.
2. **Creditor resolves** - `PATCH /payments/:id` with `CONFIRM` or `REJECT`
   (+ a reason: forgot / wrong amount / other). Only the recipient can call
   this.
3. **On CONFIRM**, balances are recomputed inside the same transaction; if
   every member's balance is now 0, the group transitions to `CLOSED` (its
   invite link also becomes invalid from that point on).
4. **On REJECT**, the debtor sees the reason in their notifications and can
   submit a new payment for the same debt.

## 8. Edge cases handled deliberately

| Case | Rule |
|---|---|
| Rounding | Leftover cent from an uneven split goes to the payer. |
| Invite link not clicked in 30 min | Link becomes invalid; owner can generate a new one, which invalidates the old one. |
| Clicking an invite link while already a member | No-op - redirects straight into the group. |
| `from_user == to_user` | Structurally impossible - the simplification algorithm never produces this by construction, so no extra guard is needed. |
| Invite link to a since-closed group | Rejected with a "this group is now closed" message. |
| Partial payment | Not supported in the MVP - the amount field is pre-filled from the checklist and not editable by the user. |
| Rejected settlement | Debtor sees the reason and can retry; a new `PENDING_CONFIRMATION` for the same pair is otherwise blocked by a unique constraint (double-send protection). |
| Member joins after an expense exists | Included retroactively in that expense's split - see §5. |
| Leaving a group | Not supported in the MVP; membership is permanent until the group closes. |

## 9. Concurrency & security notes

- **Advisory lock**: `PATCH /payments/:id` wraps its transaction in
  `pg_advisory_xact_lock(hashtext(groupId))` so two confirmations in the same
  group can't race on balance recomputation or group closure.
- **Double-send protection**: a pending payment for the same debtor→creditor
  pair is rejected both by an application-level check and, as a backstop, a
  DB unique constraint (Prisma `P2002`).
- **Checklist enforcement**: `POST /:groupId/payments` requires its
  `to_user`/`amount_kurus` to match a currently-computed checklist row
  exactly - a client cannot fabricate an arbitrary payment.
- **Passwords**: hashed with `bcryptjs`; see §2.1 for the timing-safe login
  behavior.
- **JWT**: `Authorization: Bearer <token>`, 7-day expiry, `sub` claim is the
  user id.
- **Authorization is per-route, not centralized**: every handler checks
  membership/ownership/recipient status itself; there's no shared policy
  middleware. This is a known simplicity-over-abstraction tradeoff for a
  project this size - see §11.

## 10. Frontend

Next.js App Router, plain `fetch` (no React Query/SWR) - deliberately kept
simple since the app has no real-time or complex caching requirements yet.

```
frontend/
  app/
    login/page.tsx                     # login + register
    page.tsx                           # home: group cards with net status
    groups/[id]/page.tsx               # group detail: members, expenses, checklist
    groups/[id]/expenses/new/page.tsx  # add-expense form
    invite/[token]/page.tsx            # invite-link landing/accept page
    notifications/page.tsx             # unread count, confirm/reject UI
  components/
    RequireAuth.tsx    # client-side route guard, redirects to /login if no token
    Button, Card, Input, StatusBadge
  lib/
    api.ts     # typed fetch wrapper; attaches Authorization header, maps error
                 responses to a typed ApiError
    auth.ts    # token/user persistence in localStorage
    types.ts, format.ts
```

`lib/api.ts` is the single point of contact with the backend - every request
goes through `apiFetch<T>`, which attaches the bearer token, throws a typed
`ApiError` (with the HTTP status and parsed body) on non-2xx responses, and
gives every route/component a fully-typed response shape. `RequireAuth` is a
thin client-side guard: pages that need a session wrap their content in it
and get redirected to `/login` if `isAuthenticated()` is false.

## 11. Known simplifications (by design, not oversight)

These are documented tradeoffs for a project of this scope, not gaps someone
forgot about:

- No centralized authorization/policy layer - every route hand-checks
  membership/ownership.
- No expense edit/delete - expenses are append-only in the MVP.
- No partial payments - a settlement must match a checklist row exactly.
- No leaving a group - membership is permanent until the group closes.
- No pagination on expense/notification lists.

## 12. API reference

All endpoints except `/health` require `Authorization: Bearer <jwt>`.
Response bodies use `snake_case` field names.

### Auth - `/auth`

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name }` | Creates a user, returns `{ user, token }` |
| POST | `/auth/login` | `{ email, password }` | Returns `{ user, token }` |

### Me - `/me`

| Method | Path | Description |
|---|---|---|
| GET | `/me` | Returns the authenticated user |

### Groups - `/groups`

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/groups` | `{ name }` | Creates a group; creator becomes the first member and owner |
| GET | `/groups` | - | All groups the user belongs to, with each one's net balance |
| GET | `/groups/:id` | - | Group detail: members, expenses (live split), checklist |
| PATCH | `/groups/:id/owner` | `{ new_owner_id }` | Transfers ownership (current owner only) |
| POST | `/groups/:id/invite-link` | - | Generates a new invite link, invalidating any prior active one (owner only) |
| POST | `/groups/:groupId/expenses` | `{ description, amount_kurus, paid_by }` | Adds an expense |
| GET | `/groups/:groupId/expenses` | - | Lists the group's expenses (live split) |
| GET | `/groups/:groupId/checklist` | - | Simplified transfer list (who should pay whom) |
| POST | `/groups/:groupId/payments` | `{ to_user, amount_kurus }` | Opens a settlement (must match a checklist row) |

### Invite links - `/invite-links`

| Method | Path | Description |
|---|---|---|
| POST | `/invite-links/:token/accept` | Accepts the invite and joins the group. No-op if already a member. 410 if expired. |

### Payments - `/payments`

| Method | Path | Body | Description |
|---|---|---|---|
| PATCH | `/payments/:paymentId` | `{ action: 'CONFIRM'\|'REJECT', rejection_reason?, rejection_note? }` | Recipient only. On CONFIRM, balances recompute and the group may auto-close. |

### Notifications - `/notifications`

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | Lists notifications (+ unread count) |
| PATCH | `/notifications/:id/read` | Marks one notification as read |

### Health - `/health`

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Runs `SELECT 1` against the DB, returns `{ status, db, timestamp }`. No auth required. |

## 13. Error format

All error responses are `{ error: string }`. Status codes used: `400`
(validation), `401` (missing/invalid auth), `403` (unauthorized), `404` (not
found), `409` (conflict - e.g. duplicate email, pending payment already
exists for the pair), `410` (invite link/group no longer valid), `500`
(unexpected error).
