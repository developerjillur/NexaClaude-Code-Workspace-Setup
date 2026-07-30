---
description: Generate an image with the Codex CLI and return its path.
argument-hint: <what the image should be> [--out assets/brand] [--name logo.png]
---

Generate: **$ARGUMENTS**

```bash
nexa-image "$ARGUMENTS"
```

Add `--out assets/brand` to put it in the repository as a source resource, or `--name x.png` to
choose the filename. Default is the project's own directory, outside the repo.

**Report the absolute path it prints.** That is what was asked for.

If it says the codex CLI is unavailable, say so plainly — **do not substitute another image
provider** or offer to install one unless asked. There is a working local generator; reaching
past it is how a request for one image turns into three installation offers.
