---
name: generate-image
description: Use whenever the user asks for an image to be generated, created, drawn, rendered or made — a logo, icon, illustration, diagram, banner, mockup, photo, texture or placeholder art. Generates it with the Codex CLI through `nexa-image` and returns the path. Also use when asked where a generated image was saved, or to regenerate one.
---

# Generating an image

**Run `nexa-image`. Do not hand-roll a script, and do not go looking for another provider.**

```bash
nexa-image "<what the image should be>"                        # → the project directory
nexa-image "<...>" --out assets/brand --name logo.png          # → into the repo, committable
nexa-image "<...>" --json                                      # machine-readable result
```

It prints the absolute path when it succeeds. **Give that path to the user** — it is usually the
thing they actually asked for.

## Why this exists as a skill

The tool shipped without one, and the model reached for a different plugin's media provider
instead, concluded there was no image generator on the machine, and offered to install two.
There was a working generator the whole time. **A tool nothing points at is a tool nobody uses.**

## What it handles that a hand-rolled call does not

Codex is an agent, not an image endpoint — it writes and runs code, so **it** decides where the
file goes and is inconsistent about saying so. Measured against the real CLI:

- asked for `/tmp/x.png` it answered `/private/tmp/x.png`, so paths are compared by **realpath**
- it may answer with `WROTE=`, a markdown link, a bare filename, a `~` path, **or nothing at all**
- when it names nothing, the output directory is watched and the new file is found anyway
- the bytes are sniffed, so an HTML error page named `.png` is **refused** rather than returned

## Where it puts things

| | |
|---|---|
| **default** | the project's own directory, outside the repo — a by-product should not appear in `git status` uninvited |
| **`--out assets/brand`** | inside the repo, for a source resource you intend to commit |

`--out` is contained to the project or its state directory. `../../../etc`, `/etc` and `~/x` are
refused, with the resolved path named.

## If it fails

- **"the codex CLI is not available"** — `codex` is not installed or not logged in. Say so; do
  not substitute another provider without being asked.
- **"codex ran but no image was produced"** — the tail of Codex's own output is printed. Read it
  before retrying; a rephrased prompt usually fixes it.

**Do not** reach for `media-use`, HeyGen, mflux or an image API for this. They are different
tools for different jobs, and reaching past a working local one is how a session ends with three
installation offers and no image.
