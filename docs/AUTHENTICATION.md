# Authentication

## Registration — `POST /api/auth/register`

Creates a `User` with `platformRole: CUSTOMER` (always — see
`docs/AUTHORIZATION.md` for why business identity is never a platform
role), Argon2id-hashed password, `accountStatus: ACTIVE`. Returns the
public user fields, an access token, and sets the refresh cookie. Rejects
a duplicate email with `409`.

## Login — `POST /api/auth/login`

On any failure — wrong password, nonexistent email, or a suspended
account — the response is the exact same `401` with the same generic
message, `"Invalid email or password"`. A password hash comparison is run
against a fixed dummy hash even when the account doesn't exist, so
response timing doesn't leak which case occurred either.

## Tokens

- **Access token**: a short-lived JWT (`JWT_ACCESS_TTL`, default 15
  minutes), signed with `JWT_ACCESS_SECRET`, carrying `sub` (user id) and
  `platformRole`. Kept in memory on the frontend only — never
  `localStorage`, never a cookie. `platformRole` in the token is never
  trusted for authorization on its own: `requireAuth` re-reads the user's
  current `platformRole` and `accountStatus` from the database on every
  request, so a suspension or role change takes effect immediately rather
  than waiting for the token to expire.
- **Refresh token**: an opaque random value (not a JWT), stored hashed
  (SHA-256) in `refresh_tokens`. Delivered as an httpOnly,
  `SameSite=Lax` cookie scoped to `/api/auth`, `secure` in production.
  Never readable from JavaScript, never sent to any other path.

## Rotation and the grace period

Every `POST /api/auth/refresh` call **rotates**: the presented token is
revoked and a new one is issued in the same rotation "family". Presenting
an already-revoked token is normally treated as a theft signal and revokes
the entire family, forcing re-login everywhere.

**Found and fixed during this phase, via real browser testing (not just
unit tests):** two legitimate, near-simultaneous refresh calls sharing one
still-valid token — two browser tabs, a flaky-network client retry, or
(as actually observed) React's development-mode effect double-invocation
on a full page reload — reliably triggered this "theft" path and logged
the user out of every session. This is not a hypothetical; the Playwright
smoke test in this phase reproduced it by simply navigating to a few pages
in sequence.

The fix has two parts, in `apps/backend/src/lib/refreshTokens.ts`:

1. **Atomic claim.** Rotating a token is now a single conditional
   `UPDATE ... WHERE id = ? AND revokedAt IS NULL`. Postgres rechecks that
   predicate against the committed row at execution time, so when two
   requests race for the same token, exactly one wins the claim — there is
   no window where both succeed and silently fork the family into two
   children.
2. **Grace period (`ROTATION_GRACE_PERIOD_MS`, 10 seconds).** The request
   that loses the claim — or presents a token already rotated moments ago
   — is, within that window, walked forward to whatever the token was most
   recently replaced by and issued a fresh token from there, instead of
   being told the family is compromised. Outside the window, or if the
   chain is dead, the original behavior applies: the whole family is
   revoked.

**This is a security trade-off, not just a bug fix, and is flagged here
for product/architecture review rather than decided silently:** for up to
10 seconds after a rotation, presenting the just-retired token is
indistinguishable, from the server's point of view, between (a) a
legitimate concurrent request and (b) an attacker who captured that token
and is racing the legitimate client. This implementation chooses to treat
that window as benign, which is the same trade-off major providers using
refresh-token rotation typically make (a short grace period in exchange
for not locking out real users on ordinary concurrency) — but it is a
judgment call about acceptable risk, and 10 seconds is a chosen default,
not a requirement handed down for this project. If a shorter/longer window,
or a different mitigation (e.g. client-side request de-duplication instead
of/in addition to a server grace period) is preferred, that's a one-constant
change plus updated tests (`apps/backend/tests/auth/tokens.test.ts` covers
both the benign-race and the genuine-reuse-after-grace-period cases).

Reuse of a token **outside** the grace period (a real replay, or a token
revoked by logout/family-revocation rather than rotation) still revokes
the whole family immediately, exactly as before.

## Logout

- `POST /api/auth/logout` — revokes the current refresh token only.
- `POST /api/auth/logout-all` — revokes every refresh token for the
  authenticated user (all devices/sessions).

## What the frontend never does

The frontend never reads the refresh token (httpOnly), never persists the
access token across a reload, and never decides authorization from the
JWT's claims — it only renders what the API, which re-checks everything
server-side, actually returns.
