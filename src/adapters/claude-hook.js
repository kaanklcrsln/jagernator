// Claude Code hook entry point: `jagernator hook claude` (reads the hook payload on stdin).
// PreToolUse  → security policy + context checks; prints a deny/ask decision or nothing.
//               It never prints "allow", so Claude Code's own permission prompts still apply.
// PostToolUse → records Read metadata (path, hash, line range).
// SessionStart→ resets this session's read record (new session or compacted context).
import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, defaultConfig, loadConfig } from '../config/index.js';
import { ContextTracker } from '../context/tracker.js';
import { loadIgnore } from '../security/ignore.js';
import { createNetworkPolicy } from '../security/network.js';
import { evaluateAction, mergeDecisions } from '../security/policy.js';
import { loadPlugins } from '../plugins/index.js';
import { logEvent } from '../state/store.js';

// Claude Code's Read returns at most this many lines when no limit is given.
export const CLAUDE_READ_DEFAULT_LIMIT = 2000;

/** Translate a Claude Code tool call into a canonical Jagernator action (or null). */
export function toAction(tool, input = {}) {
  switch (tool) {
    case 'Read':
      return { kind: 'read', path: input.file_path, offset: input.offset, limit: input.limit };
    case 'Write':
      return { kind: 'write', path: input.file_path, content: input.content };
    case 'Edit':
      return { kind: 'write', path: input.file_path, content: input.new_string };
    case 'MultiEdit':
      return { kind: 'write', path: input.file_path, content: (input.edits || []).map((e) => e.new_string).join('\n') };
    case 'NotebookEdit':
      return { kind: 'write', path: input.notebook_path, content: input.new_source };
    case 'Grep':
    case 'Glob':
      return { kind: 'search', path: input.path };
    case 'Bash':
      return { kind: 'shell', command: input.command || '' };
    case 'WebFetch':
      return { kind: 'fetch', url: input.url, payload: input.prompt };
    case 'WebSearch':
      return { kind: 'web-search', query: input.query || '' };
    default: {
      const m = /^mcp__(.+?)__(.+)$/.exec(tool || '');
      return m ? { kind: 'mcp', server: m[1], tool: m[2], input } : null;
    }
  }
}

function contextChecks(action, ctx) {
  if (action.kind !== 'read' || !ctx.tracker) return [];
  const out = [];
  const { config, tracker } = ctx;
  const abs = path.resolve(ctx.root, action.path);
  if (config.context.incremental_reads && !action.offset && !action.limit) {
    try {
      const size = fs.statSync(abs).size;
      if (size > config.context.large_file_bytes) {
        tracker.bump('largeReadsBlocked');
        out.push({
          decision: 'deny',
          rule: 'large-file',
          reason: `"${action.path}" is ${size} bytes (> context.large_file_bytes ${config.context.large_file_bytes}). Search it first (rg -n "<pattern>" "${action.path}") and read only the relevant line range with offset/limit.`,
        });
      }
    } catch {
      /* missing file: let the tool report it */
    }
  }
  if (config.context.avoid_duplicate_reads) {
    const check = tracker.checkRead(action.path, { offset: action.offset, limit: action.limit, defaultLimit: CLAUDE_READ_DEFAULT_LIMIT });
    if (check.duplicate) {
      tracker.bump('duplicateReadsBlocked');
      out.push({
        decision: 'deny',
        rule: 'duplicate-read',
        reason: `Already read "${action.path}" lines ${check.previous} this session and it is unchanged since. Use what you already have. If you need lines you haven't read, request that range specifically.`,
      });
    }
  }
  return out;
}

function buildContext(root, sessionId) {
  const config = loadConfig(root) || defaultConfig();
  const plugins = loadPlugins(root);
  return {
    root,
    config,
    ignore: loadIgnore(root),
    network: createNetworkPolicy(config, plugins),
    tracker: config.context.cache_metadata ? new ContextTracker(root, sessionId) : null,
  };
}

/** Handle one hook payload. Returns the JSON object to print, or null for "no opinion". */
export function handleClaudeHook(payload, root) {
  const event = payload.hook_event_name;
  let ctx;
  try {
    ctx = buildContext(root, payload.session_id);
  } catch (err) {
    if (event !== 'PreToolUse') return null;
    const detail = err instanceof ConfigError ? 'the Jagernator config is invalid' : `Jagernator failed to load (${err.message})`;
    return preToolUse('ask', `${detail}; run \`jagernator doctor\`. Asking instead of silently allowing.`);
  }

  if (event === 'SessionStart') {
    ctx.tracker?.reset();
    return null;
  }
  if (event === 'PostToolUse') {
    if (payload.tool_name === 'Read' && ctx.tracker && payload.tool_input?.file_path) {
      const { file_path, offset, limit } = payload.tool_input;
      ctx.tracker.recordRead(file_path, { offset, limit, defaultLimit: CLAUDE_READ_DEFAULT_LIMIT });
      ctx.tracker.save();
    }
    return null;
  }
  if (event !== 'PreToolUse') return null;

  const action = toAction(payload.tool_name, payload.tool_input);
  if (!action) return null;
  if (action.path) {
    // Repo-relative paths keep messages short and keep machine paths out of logs.
    const rel = path.relative(root, path.resolve(root, action.path));
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) action.path = rel || '.';
  }
  const security = evaluateAction(action, ctx);
  // Context checks only matter if security would let the read through.
  const result = security.decision === 'allow' ? mergeDecisions(contextChecks(action, ctx)) : security;
  if (ctx.tracker && result.rules.some((r) => r === 'duplicate-read' || r === 'large-file')) ctx.tracker.save();
  if (result.decision === 'allow') return null;
  logEvent(root, {
    agent: 'claude',
    event,
    tool: payload.tool_name,
    decision: result.decision,
    rules: result.rules,
    target: action.path || action.url || action.command || action.query || (action.server && `${action.server}/${action.tool}`) || '',
  });
  return preToolUse(result.decision, `Jagernator: ${result.reasons.join(' ')}`);
}

function preToolUse(decision, reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } };
}

export async function runClaudeHook(stdin = process.stdin) {
  let raw = '';
  for await (const chunk of stdin) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write('jagernator hook: invalid JSON on stdin\n');
    return 1;
  }
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  let out;
  try {
    out = handleClaudeHook(payload, root);
  } catch (err) {
    // Fail towards asking the user, never towards silently allowing.
    out = payload.hook_event_name === 'PreToolUse' ? preToolUse('ask', `Jagernator hook error: ${err.message}`) : null;
    process.stderr.write(`jagernator hook error: ${err.message}\n`);
  }
  if (out) process.stdout.write(JSON.stringify(out) + '\n');
  return 0;
}
