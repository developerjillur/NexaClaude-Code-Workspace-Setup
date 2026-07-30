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
    ['Do you want me to use Postgres or MySQL?', 'a choice between alternatives'],
    ['Would you like the dark theme or the light one?', 'preference'],
    ['I can do it either way — your call?', 'approval'],
    // Harmless in itself, and vetoed anyway: it names alternatives, and **a false veto costs
    // one unattended turn while a false pass costs a force-push.** The asymmetry is deliberate
    // and this case is here to record that it was chosen, not overlooked.
    ['Which file would you like me to read first, the reducer or the selector?', 'alternatives'],
  ];
  for (const [msg, why] of mustRefuse) {
    check(`REFUSES: ${msg.slice(0, 46)}`, veto(msg) !== null, `not vetoed (${why})`);
  }

  // ── THE SILENT CASE, and it matters as much as the refusals ───────────────
  //
  // **The first veto list vetoed every question that existed.** `should i|shall i|do you want`
  // matches "Shall I run the test suite?" — the exact case autopilot is for. It scored full
  // marks on the refusal half and the feature was worth nothing. These assertions are what
  // caught that, and they are the reason the rule was split into two narrow ones.
  const mayProceed = [
    'I have finished the parser. Shall I run the test suite now?',
    'The build succeeded. Want me to continue with the next module?',
    'I have written the types. Let me know if you want the docs updated too.',
    'That module is done. Shall I move on to the next one?',
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
  const crumbPath = path.join(home, '.nexa', 'autopilot-last-stop.json');
  fs.rmSync(crumbPath, { force: true });
  fire({ last_assistant_message: 'Shall I run the tests?', stop_hook_active: false });
  const crumb = fs.existsSync(crumbPath) ? JSON.parse(fs.readFileSync(crumbPath, 'utf8')) : null;
  check('a silent exit still records WHY, at a fixed path', crumb !== null && !!crumb.stage,
    JSON.stringify(crumb));
  check('...and names the project it resolved, so a mismatch is visible',
    crumb?.root === fs.realpathSync(repo) || crumb?.root === repo, crumb?.root);

  for (const d of [home, repo]) fs.rmSync(d, { recursive: true, force: true });
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  An autopilot that answers what is not its to answer is worse than none.\n');
  process.exit(1);
}
console.log('');
