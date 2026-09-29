// Test double for evals: applies a reference solution and emits a Claude-style stream-json transcript.
import fs from 'node:fs';

const ref = process.env.FAKE_AGENT_REFERENCE;
if (ref) fs.cpSync(ref, process.cwd(), { recursive: true });
if (process.env.FAKE_AGENT_LEAK) fs.writeFileSync('notes.txt', process.env.FAKE_AGENT_LEAK);
const use = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const events = [
  use('Read', { file_path: 'src/cart.js' }),
  use('Read', { file_path: 'src/cart.js' }),
  use('Edit', { file_path: 'src/cart.js' }),
  use('Read', { file_path: 'src/cart.js' }),
  use('Bash', { command: 'npm test' }),
  use('Bash', { command: 'npm test' }),
  use('WebFetch', { url: 'https://example.com' }),
  { type: 'result', num_turns: 3, usage: { input_tokens: 1200, output_tokens: 300 } },
];
for (const e of events) console.log(JSON.stringify(e));
