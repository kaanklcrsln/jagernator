// Best-effort static analysis of shell commands. This is a heuristic, not a sandbox:
// obfuscated commands, scripts in files, and interpreters can bypass it.
import { execFileSync } from 'node:child_process';

/** Split a command line into segments (by ; && || | & newline) of tokens, honoring quotes. */
export function splitCommand(command) {
  const segments = [];
  let tokens = [];
  let cur = '';
  let has = false;
  let quote = null;
  const pushTok = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const pushSeg = () => {
    pushTok();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < command.length) {
      cur += command[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (c === '\n') pushSeg();
      else pushTok();
    } else if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')' || c === '`') {
      pushSeg();
    } else if (c === '$' && command[i + 1] === '(') {
      pushSeg();
      i++;
    } else {
      cur += c;
      has = true;
    }
  }
  pushSeg();
  return segments;
}

const WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'xargs', 'exec', 'command', 'builtin', 'nice', 'timeout', 'doas']);
const READERS = new Set([
  'cat', 'less', 'more', 'head', 'tail', 'bat', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'sed', 'awk', 'cut', 'sort', 'uniq',
  'strings', 'xxd', 'od', 'hexdump', 'base64', 'cp', 'mv', 'tar', 'zip', 'gzip', 'source', '.', 'jq', 'yq', 'diff', 'nl',
  'tee', 'openssl', 'gpg', 'vi', 'vim', 'nano', 'code', 'open',
]);
const URL_RE = /\b([a-z][a-z0-9+.-]*):\/\/(?:[^\s/@'"]+@)?([^\s/:'"?#]+)/i;
const urlHosts = (text) => [...text.matchAll(new RegExp(URL_RE.source, 'gi'))].map((m) => m[2].toLowerCase());
const REGISTRIES = {
  npm: 'registry.npmjs.org', pnpm: 'registry.npmjs.org', yarn: 'registry.npmjs.org', bun: 'registry.npmjs.org', npx: 'registry.npmjs.org',
  pip: 'pypi.org', pip3: 'pypi.org', uv: 'pypi.org', poetry: 'pypi.org', pipx: 'pypi.org',
  cargo: 'crates.io', go: 'proxy.golang.org', gem: 'rubygems.org', bundle: 'rubygems.org', composer: 'repo.packagist.org',
  docker: 'registry-1.docker.io', podman: 'registry-1.docker.io',
};
const FETCH_SUBCOMMANDS = new Set(['install', 'i', 'ci', 'add', 'update', 'upgrade', 'get', 'download', 'sync', 'pull', 'fetch', 'dlx', 'exec', 'x']);
const PUBLISH_SUBCOMMANDS = new Set(['publish', 'push', 'upload', 'release']);

function hostOf(token) {
  const m = URL_RE.exec(token);
  if (m) return m[2].toLowerCase();
  const scp = token.match(/^(?:[^@\s/]+@)?([a-z0-9.-]+\.[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3}):/i);
  if (scp) return scp[1].toLowerCase();
  const bare = token.match(/^(?:[^@\s/]+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:[:/]|$)/i);
  return bare ? bare[1].toLowerCase() : null;
}

function gitRemoteHost(remote, cwd) {
  const direct = hostOf(remote);
  if (direct) return direct;
  try {
    const url = execFileSync('git', ['remote', 'get-url', remote], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
    return hostOf(url);
  } catch {
    return null;
  }
}

const positional = (args) => args.filter((a) => !a.startsWith('-'));

function analyzeSegment(tokens, cwd, out) {
  let i = 0;
  while (i < tokens.length && (WRAPPERS.has(tokens[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]))) {
    if (tokens[i] === 'env' && tokens.slice(i + 1).every((t) => t.startsWith('-') || /=/.test(t))) {
      out.push({ kind: 'env-dump', via: tokens[i] });
      return;
    }
    i++;
  }
  const cmd = (tokens[i] || '').split('/').pop();
  const args = tokens.slice(i + 1);
  if (!cmd) return;
  if ((cmd === 'printenv' && positional(args).length === 0) || (cmd === 'export' && args.includes('-p')) || (cmd === 'set' && args.length === 0)) {
    out.push({ kind: 'env-dump', via: cmd });
  }
  if (READERS.has(cmd)) for (const a of args) out.push({ kind: 'path-arg', path: a.replace(/^[<>]+/, ''), via: cmd });
  for (const a of tokens) if (a.startsWith('<') && a.length > 1) out.push({ kind: 'path-arg', path: a.slice(1), via: '<' });

  const net = (host, upload = false) => out.push({ kind: 'network', host, via: cmd, upload });
  switch (cmd) {
    case 'curl':
    case 'wget':
    case 'http':
    case 'https':
    case 'xh': {
      // Only scheme URLs are trusted as destinations; anything else is "unknown".
      const hosts = args.flatMap(urlHosts);
      const upload = args.some((a, k) =>
        /^(-d|--data|--data-binary|--data-raw|--data-urlencode|-F|--form|--json)$/.test(args[k - 1] || '') && /(^|=)@/.test(a)) ||
        args.some((a) => /^(-T|--upload-file|--post-file|--body-file)(=|$)/.test(a)) ||
        args.some((a) => /^-[dF]@/.test(a)) || (cmd !== 'curl' && cmd !== 'wget' && args.some((a) => /@[^\s]/.test(a) && a.includes('=@')));
      if (hosts.length === 0) net(null, upload);
      for (const h of new Set(hosts)) net(h, upload);
      break;
    }
    case 'ssh':
    case 'sftp':
    case 'telnet':
    case 'nc':
    case 'ncat':
    case 'netcat':
    case 'ftp':
      net(hostOf(positional(args)[0] || '') || positional(args)[0] || null, cmd === 'sftp');
      break;
    case 'scp':
    case 'rsync': {
      const pos = positional(args);
      const remoteIdx = pos.findIndex((a) => /^[^/]*:/.test(a) && !/^[a-z]+:\/\//i.test(a));
      const host = remoteIdx >= 0 ? hostOf(pos[remoteIdx]) || pos[remoteIdx].split(':')[0].split('@').pop() : null;
      if (remoteIdx >= 0) net(host, remoteIdx === pos.length - 1);
      break;
    }
    case 'git': {
      const pos = positional(args);
      const sub = pos[0];
      if (['push', 'pull', 'fetch', 'clone', 'ls-remote'].includes(sub)) {
        const remote = pos[1] || 'origin';
        net(gitRemoteHost(remote, cwd), sub === 'push');
      }
      break;
    }
    case 'gh': {
      const pos = positional(args);
      const upload = pos[0] === 'gist' && pos[1] === 'create' || pos[0] === 'release' && pos[1] === 'upload' || pos[0] === 'repo' && pos[1] === 'create';
      net('api.github.com', upload);
      break;
    }
    default: {
      if (REGISTRIES[cmd]) {
        const pos = positional(args);
        const sub = cmd === 'npx' ? 'x' : pos[0] || (cmd === 'yarn' ? 'install' : '');
        if (PUBLISH_SUBCOMMANDS.has(sub)) net(REGISTRIES[cmd], true);
        else if (FETCH_SUBCOMMANDS.has(sub) || (cmd === 'pip' || cmd === 'pip3') && sub === 'download' || (cmd === 'uv' && pos[0] === 'pip' && pos[1] === 'install')) {
          net(REGISTRIES[cmd], false);
          if (args.some((a) => a === '-g' || a === '--global' || a === '--user') || cmd === 'pipx' || (cmd === 'cargo' && sub === 'install')) {
            out.push({ kind: 'global-install', via: cmd });
          }
        }
      } else if (/^(python\d*(\.\d+)?|node|deno|ruby|perl|php|bun)$/.test(cmd) && args.some((a) => /^-(c|e|r|-eval)$/.test(a))) {
        const script = args.join(' ');
        const hosts = urlHosts(script);
        for (const h of new Set(hosts)) net(h, false);
        if (hosts.length === 0 && /\b(fetch|requests\.|urllib|http\.request|https\.request|socket|Net::HTTP|axios)\b/.test(script)) net(null, false);
      }
    }
  }
  if (tokens.some((t) => t.includes('/dev/tcp/') || t.includes('/dev/udp/'))) net(null, true);
}

/**
 * Analyze a shell command. Returns findings:
 *  { kind: 'network', host: string|null, via, upload: boolean }
 *  { kind: 'path-arg', path, via }     (argument of a file-reading command)
 *  { kind: 'env-dump', via }           (prints environment variables)
 *  { kind: 'global-install', via }
 */
export function analyzeCommand(command, cwd = process.cwd()) {
  const out = [];
  for (const seg of splitCommand(command)) analyzeSegment(seg, cwd, out);
  return out;
}
