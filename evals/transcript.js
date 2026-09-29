// Parses Claude Code `--output-format stream-json --verbose` transcripts into metrics.
// Other agents: returns { parsed: false } and metrics are reported as unavailable.
import { analyzeCommand } from '../src/security/shell.js';

export function parseClaudeStream(text) {
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* partial line */
    }
  }
  const toolUses = events
    .filter((e) => e.type === 'assistant' && Array.isArray(e.message?.content))
    .flatMap((e) => e.message.content.filter((c) => c.type === 'tool_use'));
  if (!events.some((e) => e.type === 'assistant' || e.type === 'result')) return { parsed: false };

  const lastEdit = new Map();
  const readsSeen = new Map();
  let duplicateReads = 0;
  let reads = 0;
  const commands = new Map();
  let networkAttempts = 0;
  toolUses.forEach((t, i) => {
    const input = t.input || {};
    if (t.name === 'Read') {
      reads++;
      const key = `${input.file_path}:${input.offset || 1}:${input.limit || ''}`;
      const prev = readsSeen.get(key);
      if (prev !== undefined && (lastEdit.get(input.file_path) ?? -1) < prev) duplicateReads++;
      readsSeen.set(key, i);
    } else if (['Edit', 'MultiEdit', 'Write'].includes(t.name)) lastEdit.set(input.file_path, i);
    else if (t.name === 'Bash') {
      commands.set(input.command, (commands.get(input.command) || 0) + 1);
      if (analyzeCommand(input.command || '').some((f) => f.kind === 'network')) networkAttempts++;
    }
    if (t.name === 'WebFetch' || t.name === 'WebSearch' || t.name?.startsWith('mcp__')) networkAttempts++;
  });
  const result = [...events].reverse().find((e) => e.type === 'result');
  return {
    parsed: true,
    toolCalls: toolUses.length,
    reads,
    duplicateReads,
    bashCommands: [...commands.values()].reduce((a, b) => a + b, 0),
    repeatedCommands: [...commands.values()].reduce((a, n) => a + Math.max(n - 1, 0), 0),
    networkAttempts,
    // Provider-reported values only; null when the transcript does not include them.
    usage: result?.usage ?? null,
    costUsd: result?.total_cost_usd ?? null,
    turns: result?.num_turns ?? null,
  };
}
