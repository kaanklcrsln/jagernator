import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, JAG_DIR, configPath, loadConfig, renderConfig } from '../config/index.js';
import { AGENTS } from '../config/schema.js';
import { runClaudeHook } from '../adapters/claude-hook.js';
import { listSessions, estimateTokens } from '../context/tracker.js';
import { detectAgents, detectProject } from '../core/detect.js';
import { doctor } from '../core/doctor.js';
import { install } from '../core/install.js';
import * as wf from '../core/workflow.js';
import { loadPlugins } from '../plugins/index.js';
import { PKG_ROOT } from '../paths.js';
import { loadIgnore } from '../security/ignore.js';
import { createNetworkPolicy } from '../security/network.js';
import { evaluateAction } from '../security/policy.js';
import { detectSecrets, redact } from '../security/secrets.js';
import { discoverSkills, loadSkill, skillReferences } from '../skills/registry.js';

const VERSION = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;

const HELP = `Jagernator ${VERSION} — engineering harness for AI coding agents

Usage: jagernator <command> [options]

Setup
  init [--agents claude,codex,generic] [--force]   Install Jagernator into this project (idempotent)
  update [--force]                                  Refresh policies, skills and adapter files
  doctor                                            Check installation, config and security posture
  version                                           Print version

Skills
  skills                                            List skills (metadata only)
  skills show <name> [reference.md]                 Print one skill (or one of its references)

Workflow
  task start "<goal>" | note <kind> "<text>" | phase <phase> | show | complete [--unverified "<reason>"]
  verify -- <command...>                            Run a check and record pass/fail + workspace fingerprint

Context & security
  context                                           Read statistics for recent sessions
  check read|write|shell|fetch|search <arg>         Evaluate an action against the policy
  scan <file...>                                    Report likely secrets (type and line only)
  redact                                            Redact secrets from stdin to stdout
  hook claude                                       Claude Code hook entry point (used by .claude/settings.json)
`;

class UsageError extends Error {}

function findRoot(start = process.cwd()) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, JAG_DIR, 'config.yaml'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

function requireRoot() {
  const root = findRoot();
  if (!root) throw new UsageError('No Jagernator project found (missing .jagernator/config.yaml). Run `jagernator init` first.');
  return root;
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

function printReport({ report }) {
  const n = (k) => report[k].length;
  for (const f of report.created) console.log(`  + ${f}`);
  for (const f of report.updated) console.log(`  ~ ${f}`);
  for (const f of report.removed) console.log(`  - ${f}`);
  for (const s of report.skipped) console.log(`  ! ${s.path}: ${s.reason}`);
  console.log(`${n('created')} created, ${n('updated')} updated, ${n('removed')} removed, ${n('unchanged')} unchanged, ${n('skipped')} skipped`);
}

function cmdInit(args) {
  const force = args.includes('--force');
  const agentsFlag = flag(args, '--agents');
  const root = process.cwd();
  const file = configPath(root);
  let config;
  if (fs.existsSync(file)) {
    config = loadConfig(root); // throws on invalid config: never overwrite it
    console.log(`Using existing ${JAG_DIR}/config.yaml`);
    if (agentsFlag) console.log('  (--agents ignored: edit agents in config.yaml)');
  } else {
    const detected = detectAgents(root);
    let agents = agentsFlag ? agentsFlag.split(',').map((a) => a.trim()).filter(Boolean) : [...detected, 'generic'];
    const unknown = agents.filter((a) => !AGENTS.includes(a));
    if (unknown.length) throw new UsageError(`Unknown agent(s): ${unknown.join(', ')}. Known: ${AGENTS.join(', ')}`);
    agents = [...new Set(agents)];
    const project = detectProject(root);
    console.log(`Detected agents: ${detected.join(', ') || 'none'}`);
    console.log(`Detected technologies: ${project.technologies.join(', ') || 'none'}`);
    if (project.registries.length) console.log(`Allowlisting package registries: ${project.registries.join(', ')}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderConfig({ agents, allowedDestinations: project.registries }));
    console.log(`  + ${JAG_DIR}/config.yaml`);
    config = loadConfig(root);
  }
  printReport(install(root, config, { force }));
  console.log('Next: jagernator doctor');
}

function cmdUpdate(args) {
  const root = requireRoot();
  printReport(install(root, loadConfig(root), { force: args.includes('--force') }));
}

function cmdDoctor() {
  const root = findRoot() || process.cwd();
  const results = doctor(root);
  const icon = { ok: '✔', warn: '⚠', error: '✖' };
  for (const r of results) {
    console.log(`${icon[r.level]} [${r.area}] ${r.message}`);
    if (r.fix && r.level !== 'ok') console.log(`    fix: ${r.fix}`);
  }
  const errors = results.filter((r) => r.level === 'error').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  console.log(`\n${errors} error(s), ${warns} warning(s)`);
  return errors ? 1 : 0;
}

function cmdSkills(args) {
  const root = findRoot();
  const dir = root ? path.join(root, JAG_DIR, 'skills') : path.join(PKG_ROOT, 'skills');
  const skills = discoverSkills(dir);
  const enabled = root ? new Set(loadConfig(root).skills.enabled) : null;
  if (args[0] === 'show') {
    const s = skills.find((k) => k.name === args[1]);
    if (!s) throw new UsageError(`Unknown skill "${args[1]}". Run \`jagernator skills\` to list skills.`);
    if (args[2]) {
      if (!skillReferences(s).includes(args[2]) && !skillReferences(s).includes(`references/${args[2]}`)) {
        throw new UsageError(`Skill "${s.name}" has no reference "${args[2]}". Available: ${skillReferences(s).join(', ') || 'none'}`);
      }
      process.stdout.write(fs.readFileSync(path.join(s.dir, args[2].startsWith('references/') ? args[2] : `references/${args[2]}`), 'utf8'));
    } else process.stdout.write(loadSkill(s));
    return 0;
  }
  if (args.length) throw new UsageError(`Unknown skills subcommand "${args[0]}"`);
  for (const s of skills) {
    const state = s.errors.length ? `invalid: ${s.errors.join('; ')}` : enabled && !enabled.has(s.name) ? 'disabled' : 'enabled';
    console.log(`${s.name.padEnd(22)} ${state === 'enabled' ? '' : `[${state}] `}${s.description}`);
  }
  if (!root) console.log('\n(Showing bundled skills; run inside an initialized project to see its skills.)');
  return 0;
}

function cmdTask(args) {
  const root = requireRoot();
  const [sub, ...rest] = args;
  switch (sub) {
    case 'start': {
      if (!rest[0]) throw new UsageError('Usage: jagernator task start "<goal>"');
      wf.startTask(root, rest.join(' '));
      console.log('Task started (phase: understand). Define success criteria before exploring.');
      return 0;
    }
    case 'note': {
      const [kind, ...text] = rest;
      if (!kind || !text.length) throw new UsageError(`Usage: jagernator task note <${wf.NOTE_KINDS.join('|')}> "<text>"`);
      const { repeated } = wf.addNote(root, kind, text.join(' '));
      console.log(`Recorded ${kind}.`);
      if (repeated) console.log('⚠ This failure was already recorded. Reconsider the hypothesis instead of repeating the same approach.');
      return 0;
    }
    case 'phase': {
      const t = wf.setPhase(root, rest[0]);
      console.log(`Phase: ${t.phase}. Next allowed: ${wf.TRANSITIONS[t.phase].join(', ')}`);
      return 0;
    }
    case 'show':
    case undefined: {
      const state = wf.loadState(root);
      if (!state.task) {
        console.log('No task recorded.');
        return 0;
      }
      const t = state.task;
      console.log(`Goal: ${t.goal}\nPhase: ${t.phase}\nStarted: ${t.started}`);
      for (const n of t.notes) console.log(`  [${n.kind}] ${n.text}`);
      const vs = state.verifications.filter((v) => v.ts >= t.started);
      for (const v of vs) console.log(`  verify: ${v.passed ? 'PASS' : `FAIL (exit ${v.exitCode})`} ${v.command}`);
      if (t.phase !== 'complete') {
        const gaps = wf.completionGaps(root, loadConfig(root), state);
        console.log(gaps.length ? `Before completing:\n${gaps.map((g) => `  - ${g}`).join('\n')}` : 'Ready to complete.');
      }
      return 0;
    }
    case 'complete': {
      const reason = flag(rest, '--unverified');
      const r = wf.completeTask(root, loadConfig(root), { unverifiedReason: reason });
      if (!r.completed) {
        console.log(`Not complete:\n${r.gaps.map((g) => `  - ${g}`).join('\n')}\n(Override only with an honest reason: --unverified "<why>")`);
        return 1;
      }
      console.log(r.gaps.length ? `Completed WITHOUT: ${r.gaps.join('; ')}. Report this to the user.` : 'Task complete.');
      return 0;
    }
    default:
      throw new UsageError(`Unknown task subcommand "${sub}"`);
  }
}

function cmdVerify(args) {
  const root = requireRoot();
  const sep = args.indexOf('--');
  const cmd = sep === -1 ? args : args.slice(sep + 1);
  if (!cmd.length) throw new UsageError('Usage: jagernator verify -- <command...>');
  const command = cmd.join(' ');
  const started = Date.now();
  const res = cmd.length === 1 ? spawnSync(cmd[0], { cwd: root, stdio: 'inherit', shell: true }) : spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit' });
  if (res.error) throw new UsageError(`Could not run "${command}": ${res.error.message}`);
  const exitCode = res.status ?? 1;
  const { blindRetry } = wf.recordVerification(root, { command, exitCode, durationMs: Date.now() - started });
  console.log(`\njagernator verify: ${exitCode === 0 ? 'PASS' : `FAIL (exit ${exitCode})`} — ${command}`);
  if (blindRetry) console.log('⚠ Same check already failed on this exact workspace. Retrying changes nothing: diagnose and form a new hypothesis.');
  return exitCode;
}

function cmdContext() {
  const root = requireRoot();
  const sessions = listSessions(root).slice(0, 5);
  if (!sessions.length) {
    console.log('No read metadata recorded yet (populated by the Claude Code hooks).');
    return 0;
  }
  for (const s of sessions) {
    const files = Object.values(s.files);
    const rereads = files.reduce((n, f) => n + Math.max(f.reads - 1, 0), 0);
    console.log(`Session ${s.session} (updated ${s.updated})`);
    console.log(`  files read: ${files.length}, reads: ${s.stats.reads}, rereads allowed (changed files or new ranges): ${rereads}`);
    console.log(`  bytes read: ${s.stats.bytesRead} (~${estimateTokens(s.stats.bytesRead)} tokens, estimate at 4 bytes/token)`);
    console.log(`  duplicate reads blocked: ${s.stats.duplicateReadsBlocked}, large whole-file reads blocked: ${s.stats.largeReadsBlocked}`);
  }
  return 0;
}

function cmdCheck(args) {
  const root = findRoot() || process.cwd();
  const [kind, ...rest] = args;
  const arg = rest.join(' ');
  const actions = {
    read: { kind: 'read', path: arg },
    write: { kind: 'write', path: arg },
    search: { kind: 'search', path: arg },
    shell: { kind: 'shell', command: arg },
    fetch: { kind: 'fetch', url: arg },
  };
  if (!actions[kind] || !arg) throw new UsageError('Usage: jagernator check read|write|search|shell|fetch <arg>');
  let config;
  try {
    config = loadConfig(root);
  } catch (err) {
    if (err instanceof ConfigError) throw new UsageError(err.message);
    throw err;
  }
  if (!config) throw new UsageError('No Jagernator config here. Run `jagernator init` first.');
  const ctx = { root, config, ignore: loadIgnore(root), network: createNetworkPolicy(config, loadPlugins(root)) };
  const r = evaluateAction(actions[kind], ctx);
  console.log(r.decision.toUpperCase());
  for (const reason of r.reasons) console.log(`  ${reason}`);
  return r.decision === 'allow' ? 0 : r.decision === 'ask' ? 3 : 2;
}

function cmdScan(args) {
  if (!args.length) throw new UsageError('Usage: jagernator scan <file...>');
  let found = 0;
  for (const f of args) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (err) {
      console.error(`${f}: ${err.code || err.message}`);
      continue;
    }
    for (const s of detectSecrets(text)) {
      found++;
      console.log(`${f}:${s.line}: ${s.type} (${s.confidence} confidence)`);
    }
  }
  if (!found) console.log('No likely secrets found (detection is pattern-based and not exhaustive).');
  return found ? 1 : 0;
}

async function cmdRedact() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(redact(input));
  return 0;
}

export async function main(argv) {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case 'init':
        return cmdInit(args) ?? 0;
      case 'update':
        return cmdUpdate(args) ?? 0;
      case 'doctor':
        return cmdDoctor();
      case 'skills':
        return cmdSkills(args);
      case 'version':
      case '--version':
      case '-v':
        console.log(`jagernator ${VERSION}`);
        return 0;
      case 'task':
        return cmdTask(args);
      case 'verify':
        return cmdVerify(args);
      case 'context':
        return cmdContext();
      case 'check':
        return cmdCheck(args);
      case 'scan':
        return cmdScan(args);
      case 'redact':
        return await cmdRedact();
      case 'hook':
        if (args[0] !== 'claude') throw new UsageError('Usage: jagernator hook claude');
        return await runClaudeHook();
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        process.stdout.write(HELP);
        return 0;
      default:
        throw new UsageError(`Unknown command "${cmd}". Run \`jagernator help\`.`);
    }
  } catch (err) {
    if (err instanceof UsageError || err instanceof ConfigError || err instanceof wf.WorkflowError) {
      console.error(`jagernator: ${err.message}`);
      return 1;
    }
    throw err;
  }
}
