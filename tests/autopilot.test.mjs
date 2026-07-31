#!/usr/bin/env node
// Autopilot continues an unattended session. This is mostly about what it must REFUSE to do.
//
// The feature is small; the danger is not. An autopilot that answers "shall I force-push?" has
// defeated every gate this workspace exists to enforce, and it does so silently, while nobody is
// watching — which is the definition of the situation it runs in.
//
// So the veto list gets the most assertions, and the model is never given the chance to overrule
// it: the veto runs BEFORE the model is asked, and again on what the model proposes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOOK = path.join(ROOT, 'plugin', 'scripts', 'hooks', 'autopilot.mjs');
const CTL = path.join(ROOT, 'plugin', 'scripts', 'autopilot-ctl.mjs');
const { veto, looksLikeWaiting } = await import(HOOK.replace(/^/, 'file://'));

let pass = 0; let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

console.log('═'.repeat(72));
console.log('  AUTOPILOT — mostly assertions about what it will not answer');
console.log('═'.repeat(72));

// ── the veto ────────────────────────────────────────────────────────────────
console.log('\n▸ the refusal list — checked before any model is asked');
{
  // Every one of these is a question that reached a human BECAUSE it was theirs.
  const mustRefuse = [
    ['Shall I force-push this to main?', 'publishing'],
    ['Ready to deploy to production — go ahead?', 'deploy'],
    ['Should I delete these 40 files?', 'destroying'],
    ['I can run rm -rf on the build directory, continue?', 'rm -rf'],
    ['Is this the correct API key for the service?', 'credentials'],
    ['This will charge the customer £40, proceed?', 'money'],
    ['Shall I email the client about the delay?', 'contacting'],
    ['I will merge into main and squash, ok?', 'shared history'],
    ['This is irreversible — are you sure?', 'irreversible'],
  ];
  for (const [msg, why] of mustRefuse) {
    check(`REFUSES: ${msg.slice(0, 46)}`, veto(msg) !== null, `not vetoed (${why})`);
  }

  // ── ONLY destructive decisions belong to the human ────────────────────────
  //
  // Two softer rules used to live here — approval-shaped phrasing, and choices between named
  // alternatives — and they made autopilot fire almost never. Measured in a real session:
  // "Should I count the words?" continued; "Would you like me to count the words?" stopped.
  // Same file, same task, different grammar. **That is a coin toss dressed as a safety
  // boundary**, and a preference between harmless options is not worth stalling an unattended
  // run for.
  //
  // These are the cases that must now proceed. They are the whole point of the feature.
  const mayProceed = [
    'I have finished the parser. Shall I run the test suite now?',
    'The build succeeded. Want me to continue with the next module?',
    'I have written the types. Let me know if you want the docs updated too.',
    'That module is done. Shall I move on to the next one?',
    'Would you like me to count the words in notes.md?',
    'Do you want me to read the reducer or the selector first?',
    'I can do it either way — your call?',
    'Would you like the dark theme or the light one?',
  ];
  for (const msg of mayProceed) {
    check(`allows: ${msg.slice(0, 46)}`, veto(msg) === null, `wrongly vetoed: ${veto(msg)}`);
  }
}

// ── is it even waiting? ─────────────────────────────────────────────────────
console.log('\n▸ waiting vs finished — a finished turn must not be nudged');
{
  check('a trailing question reads as waiting', looksLikeWaiting('Shall I continue?'));
  check('an explicit hand-back reads as waiting', looksLikeWaiting('Done. Let me know how to proceed.'));
  check('a plain report does NOT', !looksLikeWaiting('I fixed the bug and the tests pass.'));
  check('an empty message does NOT', !looksLikeWaiting(''));
}

// ── the hook, end to end, without spending a model ──────────────────────────
console.log('\n▸ the hook — every gate before the model is reached');
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-home-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
  fs.writeFileSync(path.join(repo, '.nexa'), JSON.stringify({ nexaId: 'autopilot-probe' }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo };

  const fire = (payload, extraEnv = {}) => {
    const r = spawnSync('node', [HOOK], {
      input: JSON.stringify(payload), encoding: 'utf8', env: { ...env, ...extraEnv }, timeout: 20000,
    });
    return { status: r.status, out: (r.stdout ?? '').trim() };
  };
  const waiting = { last_assistant_message: 'Shall I run the tests now?', stop_hook_active: false };

  // OFF is the default, and it must cost almost nothing — this runs on every turn of every
  // session, so an unconfigured workspace must not pay for a feature it never enabled.
  const t0 = Date.now();
  const off = fire(waiting);
  const ms = Date.now() - t0;
  check('OFF by default — no output, exit 0', off.status === 0 && off.out === '', off.out);
  check(`...and it is cheap when off (${ms} ms)`, ms < 1500, `${ms} ms`);

  // Turn it on through the real CLI, not by hand-writing state.
  // THE SILENT CASE for the CLI: in a real project it allows the change and exits 0. Without
  // this the refusal below would be satisfied by a tool that refuses unconditionally.
  const on = spawnSync('node', [CTL, 'on', '3'], { encoding: 'utf8', env });
  check('autopilot-ctl ALLOWS enabling in a resolvable project, exit 0',
    on.status === 0 && /autopilot ON/.test(on.stdout), `exit ${on.status}`);

  // stop_hook_active is the loop guard: a continue must not trigger a continue.
  check('a continue cannot trigger another continue (stop_hook_active)',
    fire({ ...waiting, stop_hook_active: true }).out === '');

  // The recursion guard: the model child loads this same hook when the plugin is installed.
  check('the model child cannot re-enter the hook',
    fire(waiting, { NEXA_AUTOPILOT_CHILD: '1' }).out === '');

  // A finished turn is left alone.
  check('a finished turn is not nudged',
    fire({ last_assistant_message: 'All tests pass.', stop_hook_active: false }).out === '');

  // **The veto, through the real hook** — and no model is spawned, so this is fast and free.
  const dangerous = fire({ last_assistant_message: 'Shall I force-push to main?', stop_hook_active: false });
  check('REFUSES a dangerous question through the hook, silently and safely',
    dangerous.status === 0 && dangerous.out === '', dangerous.out);

  // ...and it is written down, because an unattended run has to be auditable afterwards.
  const logPath = path.join(home, '.nexa', 'projects',
    fs.realpathSync(repo).replace(/[^A-Za-z0-9._-]/g, '-'), 'autopilot-log.jsonl');
  const logged = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  check('...and the refusal is logged with its reason',
    /"decision":"refused"/.test(logged) && /publishing/.test(logged), logged.slice(0, 200));

  // The budget hands back rather than running forever.
  const st = path.join(path.dirname(logPath), 'autopilot.json');
  fs.writeFileSync(st, JSON.stringify({ enabled: true, maxContinues: 3, continues: 3 }));
  check('a spent budget hands control back instead of continuing', fire(waiting).out === '');
  check('...and says so in the log', /budget spent/.test(fs.readFileSync(logPath, 'utf8')));

  spawnSync('node', [CTL, 'off'], { encoding: 'utf8', env });
  check('autopilot-ctl off disables it — the hook then stays silent', fire(waiting).out === '');

  // ── the CLI's own refusal ──────────────────────────────────────────────────
  //
  // Enabling a mode that continues sessions on your behalf must not be possible when the tool
  // cannot tell which project it would apply to. "On, somewhere" is not a state anyone can
  // reason about, and `guard-coverage` refuses a control with no watched refusal for exactly
  // this reason.
  // It has to be the INSTALLED layout: in a clone the workspace sits directly above the plugin,
  // so `projectRoot` always finds it and the refusal is unreachable. The first version of this
  // assertion ran from the checkout, resolved fine, and failed — a fixture that could not
  // produce the condition it was testing.
  const cache = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cache-')), 'nexa-workspace', '1.0.0');
  fs.mkdirSync(cache, { recursive: true });
  fs.cpSync(path.join(ROOT, 'plugin'), cache, { recursive: true });
  const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-nowhere-'));
  const homeless = spawnSync('node', [path.join(cache, 'scripts', 'autopilot-ctl.mjs'), 'on'], {
    encoding: 'utf8', cwd: nowhere,
    env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: '' },
  });
  check('autopilot-ctl REFUSES to enable when no project can be resolved',
    homeless.status === 2, `exit ${homeless.status}`);
  check('...and says why on stderr rather than exiting quietly',
    /no project found/.test(`${homeless.stdout}${homeless.stderr}`));
  for (const d of [path.dirname(path.dirname(cache)), nowhere]) fs.rmSync(d, { recursive: true, force: true });

  // ── the breadcrumb: silence must still be diagnosable ────────────────────
  //
  // Every early exit is silent by design, which made "on and nothing happened"
  // indistinguishable from "the hook never ran". A user hit exactly that: autopilot ON, a
  // question that passes the veto, stop hooks visibly running, and an empty log.
  // Per-project: the global path is only used when NO project could be resolved.
  const crumbPath = path.join(path.dirname(logPath), 'autopilot-last-stop.json');
  fs.rmSync(crumbPath, { force: true });
  fire({ last_assistant_message: 'Shall I run the tests?', stop_hook_active: false });
  const crumb = fs.existsSync(crumbPath) ? JSON.parse(fs.readFileSync(crumbPath, 'utf8')) : null;
  check('a silent exit still records WHY, at a fixed path', crumb !== null && !!crumb.stage,
    JSON.stringify(crumb));
  // **Which version actually ran.** Claude Code loads hooks once at session start and the cache
  // keeps every version side by side, so a session can run 1.3.0 while the CLI on PATH is 1.4.1.
  // From outside the session that is indistinguishable from a real bug — and it cost several
  // rounds of "it still does not work" against a hook already fixed twice.
  check('the breadcrumb records which plugin version actually ran',
    typeof crumb?.hookVersion === 'string' && /^\d+\.\d+\.\d+$/.test(crumb.hookVersion),
    crumb?.hookVersion);

  check('...and names the project it resolved, so a mismatch is visible',
    crumb?.root === fs.realpathSync(repo) || crumb?.root === repo, crumb?.root);

  // ── whose session wrote it ────────────────────────────────────────────────
  //
  // The version above is only meaningful next to an answer to "was this MY session?". A crumb
  // records the last turn that ENDED here, which is routinely a session closed hours ago —
  // and doctor announced that version as "the running session loaded X". A fresh session on
  // 1.6.0 that had simply not finished a turn yet was told it was running 1.5.0 and to restart,
  // which it had already done. Second false alarm from this same comparison.
  fs.rmSync(crumbPath, { force: true });
  fire({ last_assistant_message: 'Shall I run the tests?', stop_hook_active: false, session_id: 'SESSION-A' });
  const idCrumb = JSON.parse(fs.readFileSync(crumbPath, 'utf8'));
  check('the breadcrumb records WHICH SESSION wrote it', idCrumb.sessionId === 'SESSION-A',
    JSON.stringify(idCrumb.sessionId));

  const doctor = (sessionId) => spawnSync('node', [CTL, 'doctor'], {
    encoding: 'utf8', cwd: repo,
    env: { ...env, CLAUDE_CODE_SESSION_ID: sessionId },
  }).stdout ?? '';
  // Force the version apart, so the comparison has something to find in both directions.
  fs.writeFileSync(crumbPath, JSON.stringify({ ...idCrumb, hookVersion: '0.0.1-old' }, null, 2));

  const otherSession = doctor('SESSION-B-live-now');
  check('doctor does NOT cry mismatch over a crumb from an ended session',
    !/VERSION MISMATCH/.test(otherSession), otherSession.trim().split('\n').slice(-4).join(' | '));
  check('...it says whose session it was, instead of implying it was yours',
    /EARLIER session/.test(otherSession));

  const sameSession = doctor('SESSION-A');
  check('doctor DOES cry mismatch when this very session loaded the older hook',
    /VERSION MISMATCH/.test(sameSession), sameSession.trim().split('\n').slice(-4).join(' | '));
  check('...and the alarm claims only what the crumb proves', /this session's hook is 0\.0\.1-old/.test(sameSession));

  // **Per project, not global.** One shared file means every project overwrites every other's,
  // so doctor in project A reads project B's crumb and reports a MISMATCH that is nothing but
  // "you have two projects". Shipped that way and it fired a false alarm within ten minutes.
  // Cleared first: the recursion-guard case earlier in this block legitimately writes globally,
  // because it exits before any project is resolved. What must not happen is a RESOLVABLE run
  // writing there — that is what poisons every other project's doctor.
  const globalCrumb = path.join(home, '.nexa', 'autopilot-last-stop.json');
  fs.rmSync(globalCrumb, { force: true });
  fire({ last_assistant_message: 'Shall I run the tests?', stop_hook_active: false });
  check('a resolvable project writes its crumb PER PROJECT, not to the shared path',
    !fs.existsSync(globalCrumb), 'a global crumb would alarm every other project');
  check('...and it lands inside that project\'s own directory',
    fs.existsSync(path.join(path.dirname(logPath), 'autopilot-last-stop.json')));

  for (const d of [home, repo]) fs.rmSync(d, { recursive: true, force: true });
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  An autopilot that answers what is not its to answer is worse than none.\n');
  process.exit(1);
}
console.log('');
