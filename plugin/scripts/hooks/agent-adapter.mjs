#!/usr/bin/env node
// One guard, five agents. Speaks each tool's hook protocol; runs the same refusal underneath.
//
//   agent-adapter.mjs <guard.mjs>     read a hook event on stdin, translate, run the guard
//   agent-adapter.mjs --dialects      what it recognises, and how each one blocks
//
// Exit 0 = allow. Exit 2 = BLOCK — and exit 2 means block in every dialect below, which is the
// single fact this file is built on.
//
// ── why this exists ─────────────────────────────────────────────────────────
//
// `AGENTS.md` §0 used to say enforcement here was Claude-Code-only and everyone else got prose.
// That was true when it was written and is no longer: **seven of ten agent tools now ship a
// PreToolUse-class gate that can refuse a tool call before it happens.** Verified against each
// vendor's own documentation:
//
//   Claude Code       PreToolUse            exit 2, or {"permissionDecision":"deny"}
//   Cursor            preToolUse            exit 2, or {"permission":"deny"}
//   Codex CLI         PreToolUse            exit 2, or hookSpecificOutput.permissionDecision
//   Copilot CLI/cloud preToolUse            exit 2 (fail-CLOSED — a crash denies)
//   Windsurf / Devin  pre_write_code, …     exit 2 ONLY. No JSON verdict exists.
//   Zed               —                     declarative always_deny regex; no scriptable hook
//   Antigravity       —                     no hook mechanism documented
//
// **Exit 2 blocks in all five that have hooks.** So the hard part is not the verdict, it is the
// INPUT: each tool names the tool and its arguments differently, and a guard that cannot find the
// file path in the event is a guard that allows everything.
//
// ── the fail direction, chosen deliberately and against this repo's usual rule ──
//
// Everything else here fails CLOSED. This does not: an unrecognised event shape ALLOWS, and says
// so on stderr. The reasoning is specific rather than a preference:
//
//   · a guard that blocks every action in a tool whose dialect it cannot parse makes that tool
//     unusable, and an unusable guard is uninstalled within the hour — taking the cases it DID
//     understand with it
//   · layer 0 is underneath. A bad edit that gets past this is still refused at `git commit` by
//     the hooks `nexa-portable --install` writes
//
// That second clause is the whole justification and it is void without it. If you remove the
// commit hooks, this becomes a fail-open control with nothing behind it.
// @rules unknown-dialect, guard-missing

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * How each tool spells a hook event, and how it wants to be told "no".
 *
 * `detect` runs against the parsed stdin object. Order matters: the most specific signature
 * first, so a tool that carries several of these keys is not claimed by the loosest match.
 */
const DIALECTS = [
  {
    id: 'codex',
    name: 'Codex CLI',
    // Codex is the only one that echoes the event name back inside a hookSpecificOutput
    // envelope, and it accepts that same envelope as the verdict.
    detect: (e) => typeof e?.hook_event_name === 'string' && 'tool_name' in e && 'cwd' in e && 'session_id' in e,
    deny: (why) => JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why,
      },
    }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detect: (e) => 'hook_event_name' in e && ('conversation_id' in e || 'generation_id' in e || 'workspace_roots' in e),
    deny: (why) => JSON.stringify({ permission: 'deny', user_message: why, agent_message: why }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf / Devin Desktop',
    // pre_write_code / pre_run_command / pre_read_code. **There is no JSON verdict at all** —
    // exit 2 is the only signal, and any other non-zero exit lets the action proceed. So this
    // dialect must never be told anything on stdout.
    detect: (e) => typeof e?.hook_type === 'string' && /^(pre|post)_/.test(e.hook_type),
    deny: null,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    detect: (e) => 'tool_name' in e && ('event' in e || 'eventName' in e) && !('hook_event_name' in e),
    deny: (why) => JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: why }),
  },
  {
    id: 'claude',
    name: 'Claude Code',
    // Loosest, therefore last. The native shape, and the one every other dialect is translated
    // INTO before the guard sees it.
    detect: (e) => 'tool_name' in e && 'tool_input' in e,
    deny: (why) => JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why,
      },
    }),
  },
];

if (process.argv.includes('--dialects')) {
  console.log('\n  Hook dialects this adapter speaks:\n');
  for (const d of DIALECTS) {
    console.log(`    ${d.id.padEnd(10)} ${d.name.padEnd(26)} ${d.deny ? 'exit 2 + JSON verdict' : 'exit 2 only'}`);
  }
  console.log('\n  Exit 2 means BLOCK in every one of them. That is the fact this file rests on.');
  console.log('  Zed and Antigravity have no scriptable hook — they get layer 0 and AGENTS.md.\n');
  process.exit(0);
}

/**
 * `--post` — the after-the-fact mode, and it exists for exactly one measured reason.
 *
 * **Codex CLI's `PreToolUse` fires for `Bash` and not for `apply_patch`**, which is how it edits
 * files. Captured across a full session: five PreToolUse events, all Bash; `apply_patch` appears
 * only in `PostToolUse`, after the write. `PermissionRequest` never fires for it either, under
 * any approval policy tried. So a Codex file edit cannot be PREVENTED on that version by anybody.
 *
 * What CAN be done is undo it. A PostToolUse hook exiting 2 surfaces its message to Codex's tool
 * router — measured — so the agent is told, and this restores the file underneath.
 *
 * **Nothing is destroyed.** The written content is copied to the state directory first and the
 * message names the copy. Deleting an agent's work silently would be a worse failure than the one
 * this is fixing, and "the guard was wrong once" must not cost somebody an afternoon.
 */
const POST = process.argv.includes('--post');

const guardArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!guardArg) {
  console.error('usage: agent-adapter.mjs <guard.mjs>   (see --dialects)');
  process.exit(2);
}
const guard = [path.resolve(guardArg), path.join(HERE, guardArg)].find((p) => fs.existsSync(p));
if (!guard) {
  // A missing guard is NOT an allow. This is the one place the fail-open reasoning above does
  // not apply: the dialect was understood, the guard simply is not installed, and reporting that
  // as "permitted" would be a broken installation certifying a repository.
  console.error(`refused: guard-missing\nagent-adapter cannot find ${guardArg}. A guard that is not installed has not passed.`);
  process.exit(2);
}

const stdin = await new Promise((r) => {
  let s = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { s += d; });
  process.stdin.on('end', () => r(s));
});

let event;
try { event = JSON.parse(stdin || '{}'); } catch { event = {}; }

const dialect = DIALECTS.find((d) => { try { return d.detect(event); } catch { return false; } });

/**
 * Pull a file path and a shell command out of whatever shape arrived.
 *
 * Searched across every key each vendor documents, plus the obvious synonyms, because several of
 * these shapes are documented only by their FIELD LIST and not by an example — and a key we guess
 * wrong is a guard that silently sees nothing rather than one that errors.
 */
const dig = (obj, keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((o, part) => (o == null ? o : o[part]), obj);
    if (typeof v === 'string' && v) return v;
  }
  return '';
};

const filePath = dig(event, [
  'tool_input.file_path', 'tool_input.path', 'tool_input.filePath', 'tool_input.notebook_path',
  'file_path', 'path', 'filePath', 'file', 'target_file',
  'arguments.file_path', 'arguments.path', 'args.file_path', 'input.file_path', 'input.path',
]);
/**
 * Codex's `apply_patch` arrives as a COMMAND whose text is a patch, not as a file path.
 *
 *   tool_input.command = "*** Begin Patch\n*** Add File: /abs/path\n+…\n*** End Patch"
 *
 * Handed to the guard as a shell command it matched nothing — the Bash rules look for `>`,
 * `sed -i`, `tee`, and a patch header is none of those. So Codex's own editor was invisible to a
 * guard that was, on paper, wired to it. The paths are right there in the header.
 */
const patchPaths = (text) => [...String(text).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)]
  .map((m) => m[1].trim());

const command = dig(event, [
  'tool_input.command', 'command', 'tool_input.cmd', 'cmd',
  'arguments.command', 'args.command', 'input.command',
]);

// A patch is a set of file edits, not a command. Each path is checked; the first refusal wins,
// which is the same rule as a shell command touching several files.
const patched = command ? patchPaths(command) : [];

if (!dialect || (!filePath && !command)) {
  // Loud, and on stderr so it lands in the tool's log rather than in the model's context. The
  // adopter needs to know this fired, because it means layer 1 is not protecting them here.
  console.error(
    `nexa: unknown-dialect — this hook event carried no file path or command that agent-adapter\n`
    + `      recognises${dialect ? ` (dialect: ${dialect.id})` : ''}, so the guard was not run and the action is ALLOWED.\n`
    + `      Layer 0 still applies: the commit is gated. Report the event shape so this can\n`
    + `      recognise it — keys seen: ${Object.keys(event).slice(0, 12).join(', ') || '(none)'}`,
  );
  process.exit(0);
}

// Normalised into the Claude Code shape, which is what every guard in this workspace reads.
const ask = (input) => spawnSync('node', [guard], { input: JSON.stringify(input), encoding: 'utf8' });

let r; let target = filePath;
if (patched.length) {
  for (const f of patched) {
    const one = ask({ tool_name: 'Write', tool_input: { file_path: f },
      _adapter: { dialect: dialect.id, original: event?.tool_name ?? null } });
    if (one.status === 2) { r = one; target = f; break; }
    r = one;
  }
} else {
  r = ask({
    tool_name: command ? 'Bash' : 'Write',
    tool_input: command ? { command } : { file_path: filePath },
    _adapter: { dialect: dialect.id, original: event?.tool_name ?? event?.hook_type ?? null },
  });
}

if (r.status === 2 && POST) {
  // The write already happened. Save it, put the file back, and say where the copy went.
  const abs = path.isAbsolute(target) ? target : path.join(event.cwd ?? process.cwd(), target);
  const why = (r.stderr || 'refused by the workspace guard').trim();
  let saved = null;
  try {
    if (fs.existsSync(abs)) {
      const dir = path.join(os.tmpdir(), 'nexa-reverted');
      fs.mkdirSync(dir, { recursive: true });
      saved = path.join(dir, `${Date.now()}-${path.basename(abs)}`);
      fs.copyFileSync(abs, saved);
    }
    const cwd = event.cwd ?? path.dirname(abs);
    const tracked = (() => {
      try { spawnSync('git', ['ls-files', '--error-unmatch', abs], { cwd, stdio: 'ignore' }); 
        return spawnSync('git', ['ls-files', '--error-unmatch', abs], { cwd }).status === 0; } catch { return false; }
    })();
    if (tracked) spawnSync('git', ['checkout', '--', abs], { cwd });
    else if (fs.existsSync(abs)) fs.rmSync(abs);
  } catch (e) {
    console.error(`${why}\n\nnexa: the edit could NOT be undone — ${e.message}. It stands; fix it by hand.`);
    process.exit(2);
  }
  console.error(`${why}\n\nnexa: this edit was UNDONE, because your tool cannot be stopped before a write.\n`
    + `      ${path.relative(event.cwd ?? process.cwd(), abs)} is back as it was.\n`
    + (saved ? `      What you wrote is kept at ${saved} — nothing was lost.\n` : '')
    + `      Put a card in board/3-build and try again.`);
  process.exit(2);
}

if (r.status === 2) {
  const why = (r.stderr || 'refused by the workspace guard').trim();
  // stderr in every dialect, because Windsurf reads nothing else and Claude Code shows it to the
  // model. The JSON verdict is additive, for the tools that parse one.
  console.error(why);
  if (dialect.deny) console.log(dialect.deny(why));
  process.exit(2);
}
if (r.stderr) process.stderr.write(r.stderr);
process.exit(0);
