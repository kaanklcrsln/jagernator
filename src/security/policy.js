// Provider-independent evaluation of a single agent action against Jagernator's
// security policy. Adapters (e.g. the Claude Code hook) translate their tool calls
// into these canonical actions:
//   { kind: 'read', path, offset?, limit? }     { kind: 'write', path, content? }
//   { kind: 'search', path? }                   { kind: 'shell', command }
//   { kind: 'fetch', url, payload? }            { kind: 'web-search', query }
//   { kind: 'mcp', server, tool, input }
import fs from 'node:fs';
import path from 'node:path';
import { detectSecrets, isSensitivePath } from './secrets.js';
import { analyzeCommand } from './shell.js';

const RANK = { allow: 0, ask: 1, deny: 2 };
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const LARGE_PAYLOAD_BYTES = 32 * 1024;

export function mergeDecisions(results) {
  const found = results.filter(Boolean);
  if (found.length === 0) return { decision: 'allow', reasons: [], rules: [] };
  const top = Math.max(...found.map((r) => RANK[r.decision]));
  const strongest = found.filter((r) => RANK[r.decision] === top);
  return {
    decision: Object.keys(RANK)[top],
    reasons: [...new Set(strongest.map((r) => r.reason))],
    rules: [...new Set(strongest.map((r) => r.rule))],
  };
}

const highSecrets = (text) => detectSecrets(text).filter((f) => f.confidence === 'high');
const describe = (findings) => [...new Set(findings.map((f) => f.type))].join(', ');

function pathRules(p, ctx, verb) {
  if (!p) return [];
  const abs = path.resolve(ctx.root, p);
  const rel = path.relative(ctx.root, abs);
  const inside = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  const out = [];
  const ignored = inside ? ctx.ignore(rel) : null;
  if (ignored) {
    out.push({ decision: 'deny', rule: 'jagernatorignore', reason: `${verb} "${rel}" is excluded by .jagernatorignore pattern "${ignored}".` });
  }
  if (isSensitivePath(abs)) {
    const mode = ctx.config.security.sensitive_files;
    out.push({
      decision: mode,
      rule: 'sensitive-file',
      reason: `${verb} "${inside ? rel : p}" targets a likely credential file. Do not load secrets into context; ask the user for the specific non-secret value you need.`,
    });
  }
  return out;
}

function scanFileRange(abs, offset, limit) {
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return [];
  }
  if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) return [];
  let text = fs.readFileSync(abs, 'utf8');
  if (offset || limit) {
    const lines = text.split('\n');
    const start = Math.max((offset || 1) - 1, 0);
    text = lines.slice(start, limit ? start + limit : undefined).join('\n');
    return highSecrets(text).map((f) => ({ ...f, line: f.line + start }));
  }
  return highSecrets(text);
}

function evaluateShell(action, ctx) {
  const out = [];
  const findings = analyzeCommand(action.command, ctx.root);
  const network = findings.filter((f) => f.kind === 'network');
  for (const f of findings) {
    if (f.kind === 'path-arg') out.push(...pathRules(f.path, ctx, `\`${f.via}\` on`));
    else if (f.kind === 'env-dump') {
      out.push({ decision: 'ask', rule: 'env-dump', reason: `\`${f.via}\` prints environment variables, which often contain credentials.` });
    } else if (f.kind === 'global-install') {
      out.push({ decision: 'ask', rule: 'global-install', reason: `\`${f.via}\` installs globally / outside the project. Jagernator never installs globally without the user's approval.` });
    } else if (f.kind === 'network') {
      out.push(ctx.network.decide(f.host, `\`${f.via}\``));
      if (f.upload) {
        out.push({
          decision: ctx.config.security.external_source_upload,
          rule: 'external-upload',
          reason: `\`${f.via}\` uploads local content to ${f.host || 'a remote destination'} (security.external_source_upload = ${ctx.config.security.external_source_upload}).`,
        });
      }
    }
  }
  if (network.length && ctx.config.security.secret_detection === 'enabled') {
    const s = highSecrets(action.command);
    if (s.length) out.push({ decision: 'deny', rule: 'secret-egress', reason: `Command sends data over the network and contains a likely secret (${describe(s)}).` });
  }
  return out;
}

/** Evaluate one canonical action. Returns { decision, reasons, rules }. */
export function evaluateAction(action, ctx) {
  const scan = ctx.config.security.secret_detection === 'enabled';
  const out = [];
  switch (action.kind) {
    case 'read': {
      out.push(...pathRules(action.path, ctx, 'Reading'));
      if (scan && out.length === 0) {
        const s = scanFileRange(path.resolve(ctx.root, action.path), action.offset, action.limit);
        if (s.length) {
          out.push({
            decision: 'ask',
            rule: 'secret-in-file',
            reason: `"${action.path}" contains a likely secret (${describe(s)}) at line(s) ${[...new Set(s.map((f) => f.line))].join(', ')}. Reading it sends the secret to the model provider; read a line range that avoids it, or confirm.`,
          });
        }
      }
      break;
    }
    case 'write':
      out.push(...pathRules(action.path, ctx, 'Writing'));
      if (scan && action.content) {
        const s = highSecrets(action.content);
        if (s.length) out.push({ decision: 'ask', rule: 'secret-in-write', reason: `Content written to "${action.path}" contains a likely secret (${describe(s)}). Use an environment variable or secret manager instead.` });
      }
      break;
    case 'search':
      out.push(...pathRules(action.path, ctx, 'Searching'));
      break;
    case 'shell':
      out.push(...evaluateShell(action, ctx));
      break;
    case 'fetch': {
      let host = null;
      try {
        host = new URL(action.url).hostname;
      } catch {
        /* unparseable URL → unknown destination */
      }
      out.push(ctx.network.decide(host, 'Web fetch'));
      if (scan) {
        const s = highSecrets(`${action.url}\n${action.payload || ''}`);
        if (s.length) out.push({ decision: 'deny', rule: 'secret-egress', reason: `Outgoing request contains a likely secret (${describe(s)}).` });
      }
      break;
    }
    case 'web-search':
      out.push(ctx.network.decide('web-search', 'Web search'));
      if (scan && highSecrets(action.query).length) out.push({ decision: 'deny', rule: 'secret-egress', reason: 'Search query contains a likely secret.' });
      break;
    case 'mcp': {
      const serialized = JSON.stringify(action.input ?? {});
      if (!ctx.network.mcpServers.includes(action.server)) {
        const reason = `MCP server "${action.server}" is not in security.allowed_mcp_servers. MCP tools are an external data boundary.`;
        out.push({ decision: ctx.network.mode === 'ask' ? 'ask' : 'deny', rule: 'mcp', reason });
      }
      if (scan && highSecrets(serialized).length) {
        out.push({ decision: 'deny', rule: 'secret-egress', reason: `MCP call to "${action.server}" contains a likely secret (${describe(highSecrets(serialized))}).` });
      }
      if (Buffer.byteLength(serialized) > LARGE_PAYLOAD_BYTES) {
        out.push({ decision: 'ask', rule: 'large-payload', reason: `MCP call to "${action.server}" sends ${Buffer.byteLength(serialized)} bytes. Send the minimum necessary (a path, symbol, or diff) instead of bulk content.` });
      }
      break;
    }
    default:
      break;
  }
  return mergeDecisions(out);
}
