---
name: security-gate
description: Run before any card leaves 4-review. Separate from the review score and cannot be traded against it. Covers the specific holes this project has actually shipped.
---

# Security gate

**Separate from review, and not tradeable against it.** A change may score perfectly on all
five review axes and still be refused here.

This list is not generic. **Every item is a hole this project actually shipped or nearly
shipped**, which is why they are worth checking rather than assuming.

## The checks

**1 · Fail closed, always.**
An empty allowlist restricts *everyone*, not nobody. A missing config denies. The shipped bug:
an empty caller allowlist once meant "no restriction" rather than "restrict everyone" — so
**the unguarded state was the default**, at the exact moment the service became publicly
reachable. Opening it up should take an explicit `ALLOW_ALL=true`, never an empty string.

**2 · Does the guard live in code, or is it asked for in a prompt?**
A prompt is a request. A gate is a guarantee. If the rule matters, it cannot be a sentence the
model is trusted to follow.

**3 · Is authorisation checked before the resource is created?**
The shipped bug: an unauthenticated WebSocket was **accepted and held** — nothing could be
spent, but twelve sockets per client could be. Reject at the handshake, not after.

**4 · Can this reach a secret, and does the output get scrubbed?**
`src/redact.js` exists because Codex output reaches a caller's ears. Anything new that carries
model or tool output through to speech, a log, or a transcript goes through it.

**5 · Is the write confirmed before it happens?**
Every effectful tool needs `confirmBeforeWrite`; `cancel` and `delete` are privileged. **And
the open one (#163): a tool interrupted mid-flight has already had its effect.** If your change
adds an effectful tool, say in the card how an interruption is handled.

**6 · Does a generated or third-party artefact run with full privileges?**
Today every tool loads with a plain `await import()` — full Node privileges. Fine for the seven
we wrote; **not fine for anything generated or contributed.** If your change loads code from
outside the repo, it needs the isolation decision made first (#160).

**7 · Multi-tenant: is the tenant resolved once, at the edge, and enforced in the database?**
Not in application code. Row-level security, transaction-level pooling only — **session pooling
is a cross-tenant read.**

## The output

One line per check in the card. **"Checked, none apply" is a valid answer; silence is not.**
