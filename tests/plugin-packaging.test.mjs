#!/usr/bin/env node
// Is the plugin actually shippable, or does it only work from this checkout?
//
// The card named this file as its proof and it did not exist — found by a second-model review,
// which is exactly the `verify-claims` shape the workspace exists to catch, aimed at its own
// author. What it proves is the set of things that are true here and can quietly stop being
// true once the plugin is copied into a cache:
//
//   · a bare command still finds its script when the command is a SYMLINK on PATH
//   · …and when the path contains spaces
//   · every symlink inside plugin/ resolves INSIDE plugin/, or is a documented fetched one
//   · every component the manifest promises is really there
//
// The symlink rules are the reason the third matters. Claude Code preserves a link that
// resolves within the plugin's own directory, dereferences one pointing elsewhere in the same
// marketplace, and SKIPS one pointing outside it. A link that escapes therefore vanishes on
// install, and the component it stood for is silently absent.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLUGIN = path.join(ROOT, 'plugin');

let pass = 0; let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

console.log('═'.repeat(72));
console.log('  PLUGIN PACKAGING — what stops being true once it is copied');
console.log('═'.repeat(72));

// ── bin/ through a symlink ───────────────────────────────────────────────────
//
// WATCHED FAILING. The first version of every wrapper used `$(dirname "$0")` directly. Link
// /usr/local/bin/nexa-check at the plugin copy — the ordinary way to put a command on PATH —
// and $0 stays /usr/local/bin/nexa-check, so it looked for /usr/local/bin/../scripts/check.mjs.
// Not an exotic case: it is how commands are normally installed.
console.log('\n▸ bin/ — a command is usually reached through a link, not by its real path');
{
  const arena = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa pkg '));   // NB: spaces, deliberately
  try {
    const link = path.join(arena, 'nexa-card-gate');
    fs.symlinkSync(path.join(PLUGIN, 'bin', 'nexa-card-gate'), link);
    const r = spawnSync(link, [], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    check('a wrapper invoked through a symlink finds its script',
      r.status === 0 && /card|stage/i.test(out), `exit ${r.status}: ${out.slice(0, 160)}`);
    check('...and the arena path contains spaces, so quoting is proven too', / /.test(arena));

    const viaPath = spawnSync('sh', ['-c', 'nexa-card-gate'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: `${arena}:${process.env.PATH}` },
    });
    check('...and the same link works as a bare command on PATH',
      viaPath.status === 0, `exit ${viaPath.status}`);
  } finally {
    fs.rmSync(arena, { recursive: true, force: true });
  }
}

// ── symlinks inside the plugin ───────────────────────────────────────────────
console.log('\n▸ symlinks inside plugin/ — one that escapes is skipped on install');
{
  const links = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) links.push(p);
      else if (e.isDirectory()) walk(p);
    }
  };
  walk(PLUGIN);

  const inside = (p) => {
    const target = path.resolve(path.dirname(p), fs.readlinkSync(p));
    return target === PLUGIN || target.startsWith(`${PLUGIN}${path.sep}`);
  };
  // The council is fetched by council-sync into gitignored .council-src, and is documented as
  // absent from a bare clone. It is the ONE allowed escape, and it is named rather than matched
  // loosely, so a second escape cannot hide behind it.
  const isCouncil = (p) => /(^|\/)council(-custom)?(\.md)?$/.test(p);

  const escaped = links.filter((p) => !inside(p) && !isCouncil(p));
  check(`no symlink escapes the plugin (${links.length} link(s) found)`,
    escaped.length === 0, escaped.map((p) => path.relative(ROOT, p)).join(', '));

  const council = links.filter(isCouncil);
  for (const p of council) {
    const rel = path.relative(ROOT, p);
    const ignored = spawnSync('git', ['check-ignore', '-q', path.relative(ROOT, fs.readlinkSync(p).startsWith('/')
      ? fs.readlinkSync(p) : path.resolve(path.dirname(p), fs.readlinkSync(p)))], { cwd: ROOT }).status === 0;
    check(`the one allowed escape, ${rel}, points at gitignored fetched content`, ignored);
  }
}

// ── the manifest promises components that exist ──────────────────────────────
console.log('\n▸ the manifest — every component it names is really there');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  check('the manifest parses and is named', typeof manifest.name === 'string' && manifest.name.length > 0);
  for (const d of ['skills', 'commands', 'agents', 'hooks', 'scripts', 'bin', 'templates']) {
    check(`${d}/ exists and is not empty`,
      fs.existsSync(path.join(PLUGIN, d)) && fs.readdirSync(path.join(PLUGIN, d)).length > 0);
  }
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  const cmds = Object.values(hooks.hooks).flat().flatMap((g) => g.hooks).map((h) => h.command);
  const missing = cmds
    .map((c) => c.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/)?.[1])
    .filter((rel) => rel && !fs.existsSync(path.join(PLUGIN, rel)));
  check(`every hook command points at a file that exists (${cmds.length} command(s))`,
    missing.length === 0, missing.join(', '));
  check('...and every one of them is addressed through ${CLAUDE_PLUGIN_ROOT}',
    cmds.every((c) => c.includes('${CLAUDE_PLUGIN_ROOT}')), cmds.find((c) => !c.includes('${CLAUDE_PLUGIN_ROOT}')));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  A plugin that only works from its own checkout is not packaged.\n');
  process.exit(1);
}
console.log('\n  Shippable: nothing here depends on being run from this directory.\n');
