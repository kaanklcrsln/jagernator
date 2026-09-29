// Adapters translate Jagernator's canonical policy + skills into agent-specific files.
// Each adapter returns a list of operations; the installer applies them idempotently:
//   { type: 'block', path, body }          managed block inside a user-owned markdown file
//   { type: 'file',  path, content }       file fully owned by Jagernator (hash-tracked)
//   { type: 'json',  path, merge }         merge into a user-owned JSON file
import fs from 'node:fs';
import path from 'node:path';
import { renderInstructions } from './instructions.js';

export const HOOK_COMMAND = 'jagernator hook claude';
export const CLAUDE_TOOL_MATCHER = 'Read|Write|Edit|MultiEdit|NotebookEdit|Grep|Glob|Bash|WebFetch|WebSearch|mcp__.*';

const isOurs = (h) => typeof h?.command === 'string' && h.command.startsWith(HOOK_COMMAND);

/** Remove Jagernator hook entries from Claude settings, then add them back if enabled. */
export function mergeClaudeSettings(settings, enabled) {
  const out = structuredClone(settings || {});
  const hooks = out.hooks || {};
  for (const event of Object.keys(hooks)) {
    hooks[event] = (hooks[event] || [])
      .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((group) => group.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (enabled) {
    const add = (event, matcher) => {
      const group = { ...(matcher && { matcher }), hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 10 }] };
      (hooks[event] ||= []).push(group);
    };
    add('PreToolUse', CLAUDE_TOOL_MATCHER);
    add('PostToolUse', 'Read');
    add('SessionStart');
  }
  if (Object.keys(hooks).length) out.hooks = hooks;
  else delete out.hooks;
  return out;
}

export function claudeHooksInstalled(settings) {
  const pre = settings?.hooks?.PreToolUse || [];
  return pre.some((g) => g.matcher === CLAUDE_TOOL_MATCHER && (g.hooks || []).some(isOurs));
}

function claudeSkillFiles(skill) {
  const name = `jagernator-${skill.name}`;
  const base = `.claude/skills/${name}`;
  const content = fs.readFileSync(path.join(skill.dir, 'SKILL.md'), 'utf8').replace(/^(---\r?\nname:\s*).*$/m, `$1${name}`);
  const ops = [{ type: 'file', path: `${base}/SKILL.md`, content }];
  const refDir = path.join(skill.dir, 'references');
  if (fs.existsSync(refDir)) {
    for (const f of fs.readdirSync(refDir)) {
      ops.push({ type: 'file', path: `${base}/references/${f}`, content: fs.readFileSync(path.join(refDir, f), 'utf8') });
    }
  }
  return ops;
}

export const adapters = {
  claude(ctx) {
    return [
      { type: 'block', path: 'CLAUDE.md', body: renderInstructions({ ...ctx, agent: 'claude' }) },
      ...ctx.skills.flatMap(claudeSkillFiles),
      { type: 'json', path: '.claude/settings.json', merge: (s) => mergeClaudeSettings(s, ctx.config.enforcement.claude_hooks) },
    ];
  },
  codex(ctx) {
    return [{ type: 'block', path: 'AGENTS.md', body: renderInstructions({ ...ctx, agent: 'codex' }) }];
  },
  generic(ctx) {
    return [{ type: 'file', path: '.jagernator/INSTRUCTIONS.md', content: renderInstructions({ ...ctx, agent: 'generic' }) }];
  },
};
