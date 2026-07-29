// Does guard-edit.mjs still block a path with a space in it, and does it still CATCH a
// real product-code write?
//
// Written by first constructing the case it must stay SILENT on, because every control in
// this workspace was wrong on its first version in the same direction — false positive —
// and the silent case is the one that catches that.
//
//   node probe-guard.mjs

import { spawn } from 'node:child_process';

const WS = '/Volumes/T7 Shield/NexaLance-All-Projects-Portable/NexaLance-Exprement-Project/NexaCall-OS-Plan-WorkSpace-Setup';
const HOOK = `${WS}/scripts/hooks/guard-edit.mjs`;
const CODE = '/Volumes/T7 Shield/NexaLance-All-Projects-Portable/NexaLance-Exprement-Project/Realtime-codex-cli-calling-agent';
const PLAN = '/Volumes/T7 Shield/NexaLance-All-Projects-Portable/NexaLance-Exprement-Project/NexaCall-OS-Plan';

const run = (payload) =>
  new Promise((resolve) => {
    const p = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NEXA_NO_CARD: '' } });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, err: err.trim() }));
    p.stdin.end(JSON.stringify(payload));
  });

const cases = [
  {
    name: 'MUST ALLOW — quoted plan path with a space, cwd inside the product repo',
    why: 'the seventh false positive; the plan repo is not a codeDir',
    expect: 'allow',
    payload: { tool_name: 'Bash', cwd: CODE,
      tool_input: { command: `cp "${PLAN}/bench/a.mjs" "${PLAN}/bench/b.mjs"` } },
  },
  {
    name: 'MUST ALLOW — redirect into the plan repo, path has a space',
    expect: 'allow',
    payload: { tool_name: 'Bash', cwd: CODE,
      tool_input: { command: `printf x >> "${PLAN}/PLAN-58-the-wedge.md"` } },
  },
  {
    name: 'MUST BLOCK — quoted PRODUCT path with a space (the fix must not open a hole)',
    why: 'if the quoted branch swallowed too much, this write would escape',
    expect: 'block',
    payload: { tool_name: 'Bash', cwd: PLAN,
      tool_input: { command: `cp /tmp/x.js "${CODE}/src/tools.js"` } },
  },
  {
    name: 'MUST BLOCK — bare product path, no quotes (the original guarantee)',
    expect: 'block',
    payload: { tool_name: 'Bash', cwd: CODE,
      tool_input: { command: `printf x > src/tools.js` } },
  },
  {
    name: 'MUST BLOCK — tee into product code, quoted, with a space',
    expect: 'block',
    payload: { tool_name: 'Bash', cwd: PLAN,
      tool_input: { command: `echo x | tee "${CODE}/server.js"` } },
  },
  {
    name: 'MUST BLOCK — Write tool straight at product code',
    expect: 'block',
    payload: { tool_name: 'Write', tool_input: { file_path: `${CODE}/src/auth.js` } },
  },
];

let pass = 0;
for (const c of cases) {
  const { code, err } = await run(c.payload);
  const got = code === 0 ? 'allow' : 'block';
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  if (!ok) {
    console.log(`     expected ${c.expect}, got ${got}`);
    if (err) console.log(`     ${err.split('\n')[0]}`);
  }
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
