#!/usr/bin/env node
// UserPromptSubmit hook — every prompt, saved as it is typed.
//
// Why this exists: the prompts ARE the design record. Reconstructing them afterwards from
// ~/.claude/projects/*.jsonl worked once (127 of them, 25–28 July) but those logs are
// Claude Code's, not the project's — they live outside the repo, they are pruned, and they
// are keyed by a session id nobody remembers. A prompt that only exists there is in the same
// category AGENTS.md §7 puts chat in: assume it is lost.
//
// Contract with Claude Code:
//   stdin  = JSON {session_id, cwd, prompt, ...}
//   exit 0 = allow (ALWAYS — see below)
//
// This hook must never block a prompt and must never throw. A logger that can stop you
// working gets removed within a day, and the whole point is that it is still here in March.
// Every failure path below ends in exit 0.
//
// ── The part that matters ────────────────────────────────────────────────────
//
// Prompts in this project have contained a VPS root password and an OAuth callback code,
// pasted in good faith while debugging. So the text is scrubbed BEFORE it reaches disk.
//
// This is mitigation, not isolation — the same honest framing the product's own
// src/redact.js carries. A novel secret format will get through. That is why docs/prompts/
// is gitignored by default: the scrubber is the second line, and not committing is the first.

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, isAdoptedWorkspace } from './roots.mjs';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT, trusted: TRUSTED } = projectRoot();
// A writer with an unlocatable project must write NOTHING. Observed rather than theorised:
// during the window when these scripts had moved but had not yet been rewired, this hook wrote
// a shadow prompt log into plugin/docs/prompts/ — the audit trail silently forking in two.
// An installed plugin whose project cannot be resolved would do the same into its own cache,
// collecting every project it is loaded in.
// Consent, not merely location. See isAdoptedWorkspace in roots.mjs: a repository the bootstrap
// declined still has a project root, and writing a prompt log into it is kill-condition 1
// through a side door. Caught by 5-verify as `?? docs/` in a repo we had refused to adopt.
if (!TRUSTED || !isAdoptedWorkspace(ROOT)) process.exit(0);

const OUT_DIR = path.join(ROOT, 'docs', 'prompts');

/**
 * Patterns ordered by how specific they are, so a Twilio SID is labelled as one rather than
 * caught by the generic high-entropy rule. Each replacement says what was removed — a
 * redaction that leaves no trace reads as though the user never said anything there.
 */
const SCRUB = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, '«openai-key»'],
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '«jwt»'],
  [/\bAC[0-9a-fA-F]{32}\b/g, '«twilio-sid»'],
  [/\bSK[0-9a-fA-F]{32}\b/g, '«twilio-key»'],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, '«github-token»'],
  [/\bcode=[A-Za-z0-9._-]{20,}/g, 'code=«oauth-code»'],
  [/\b(?:Bearer|Authorization:)\s+[A-Za-z0-9._~+/-]{16,}=*/gi, 'Bearer «token»'],
  // ssh user@host FOLLOWED BY a password on the same line — the exact shape that was pasted.
  [/\bssh\s+\S+@[\d.]+\s+\S{6,}/g, 'ssh «host» «password»'],
  // key: value / KEY=value where the key names a secret.
  [/\b([A-Za-z_]*(?:password|passwd|secret|token|api[_-]?key|auth[_-]?token)[A-Za-z_]*)\s*[:=]\s*("[^"]+"|'[^']+'|\S+)/gi,
    (_m, k) => `${k}=«redacted»`],
];

const scrub = (s) => SCRUB.reduce((acc, [re, to]) => acc.replace(re, to), s);

try {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const input = JSON.parse(raw || '{}');
  const prompt = String(input.prompt ?? '').trim();

  // Slash commands are the harness, not the design record.
  if (!prompt || prompt.startsWith('/')) process.exit(0);

  const now = new Date();
  // Local day, so "what did I ask on Tuesday" matches the human's Tuesday, not UTC's.
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${day}.md`);

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file,
`# Prompts — ${day}

Written by the \`UserPromptSubmit\` hook as each prompt was submitted. Secrets are scrubbed on
write (\`scripts/hooks/save-prompt.mjs\`) — **mitigation, not isolation.** This directory is
gitignored; read it before committing any of it.

`);
  }

  const cwd = input.cwd ? path.basename(input.cwd) : '?';
  const body = scrub(prompt).split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
  fs.appendFileSync(file, `\n### ${time} · \`${cwd}\`\n\n${body}\n`);
} catch {
  // Deliberately silent and allowing. Nothing this hook can fail at is worth interrupting
  // a person mid-thought, and a stderr splash on every prompt is how it gets switched off.
}

process.exit(0);
