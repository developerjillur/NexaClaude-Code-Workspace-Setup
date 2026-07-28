# templates/engineering-baseline/

**Copy these into your product repo, not into the workspace.**

The workspace has no dependencies on purpose — every script in it is plain Node, so a fresh
clone runs with no install step and nothing to audit. **A linter belongs to the code being
written, not to the process writing it.**

But their absence was a real hole. A council reviewing this workspace put it at **top 10%, not
top 1%**, and the engineering baseline was part of why: excellent controls against *agent*
failure, and nothing at all of the hygiene an ordinary engineering org takes for granted.

```bash
cp templates/engineering-baseline/eslint.config.mjs   <your-code>/
cp templates/engineering-baseline/.prettierrc.json    <your-code>/
cp templates/engineering-baseline/.editorconfig       <your-code>/
cp templates/engineering-baseline/jsconfig.json       <your-code>/      # or merge into tsconfig
cp templates/engineering-baseline/dependabot.yml      <your-code>/.github/
cd <your-code> && npm i -D eslint prettier typescript
```

Then add to your product repo's `package.json`:

```json
"scripts": {
  "lint":    "eslint .",
  "format":  "prettier --check .",
  "format:fix": "prettier --write .",
  "typecheck": "tsc --noEmit",
  "test":    "<your test command>",
  "gate":    "npm run lint && npm run format && npm run typecheck && npm test"
}
```

**`scripts/check.mjs` looks for exactly those four script names** in your product repo and
warns for each one missing. It warns rather than fails, because a workspace that refuses to
start until you have configured a linter is a workspace nobody adopts on day one — but the
warning does not go away, and that is the point.

## Why these settings and not the defaults

Every rule below is here because of a failure mode this workspace exists to catch, not because
it is conventional.
