---
name: review-gate
description: Score a change on five axes before it may leave 4-review. Must be run by a different model than the one that wrote the code.
---

# Review gate

**Run by a different model than the one that wrote the code.** A model reviewing itself
agrees with itself — that is the single most common way weak code passes review in an
agentic workflow.

Score each axis **1–5**. Write the scores and the reasons into the card. **Any axis below 3
sends the card back to `3-build`** with the reason. Not a note. Back.

---

## The five axes

### 1 · Matches the spec — does it do what the card said?
Read the acceptance criteria first, the diff second. Score 1 if it solved a different or
larger problem than the card described. **Scope creep scores 1 even when the extra work is
good** — good work outside the card belongs in a new card.

### 2 · Nothing invented — is every claim checkable?
A number in a comment, a "this is faster", a "this handles X" — each is either measured,
cited, or wrong. Score 1 for any confident claim with nothing behind it.

> This project's plan carries **77 disproven claims**, nearly all of them plausible when
> written. Plausible is the failure mode, not obvious nonsense.

### 3 · Nothing duplicated — does this already exist?
```bash
graphify explain "<what the change does>"
```
Score 1 if the graph shows an existing implementation the author did not use or mention.
Score 2 if it is near-duplicate logic that should have been shared.

### 4 · Nothing extra — is every line earning its place?
Dead code, unused parameters, speculative configuration, a helper used once, commented-out
alternatives, a TODO. Score 1 for any `TODO` or commented-out code — those are unfinished
work claiming to be finished.

### 5 · Fits the file it lives in — would a reader notice two authors?
Naming, comment density, error handling style, idiom. A correct change in a foreign style is
a maintenance cost that compounds.

---

## What review does not cover

**Security is a separate gate** (`skills/security-gate`) and it cannot be traded against a
review score. A change may score 5/5/5/5/5 and still be refused on security.

**Correctness is `5-verify`.** Review reads; verify runs. Do not approve on the basis that
the code looks right.

---

## Output format

Paste this into the card, filled in:

```markdown
## Review — <model that reviewed> reviewing <model that built>

| Axis | Score | Note |
|---|---|---|
| Matches the spec |   |   |
| Nothing invented |   |   |
| Nothing duplicated |   |   |
| Nothing extra |   |   |
| Fits the file |   |   |

Verdict: PASS / BACK TO BUILD
Reason (if back):
```

**A review with five 5s and no notes is not a review.** If nothing was worth saying, say what
you checked and found clean — otherwise nobody can tell the difference between a careful pass
and a skipped one.
