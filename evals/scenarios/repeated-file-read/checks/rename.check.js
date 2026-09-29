import fs from 'node:fs';

for (const f of ['src/client.js', 'test/client.test.js', 'README.md']) {
  const text = fs.readFileSync(f, 'utf8');
  if (/(^|[^A-Za-z])timeoutMs/.test(text.replace(/requestTimeoutMs/g, ''))) {
    console.error(`${f} still mentions timeoutMs`);
    process.exit(1);
  }
  if (!text.includes('requestTimeoutMs')) {
    console.error(`${f} does not mention requestTimeoutMs`);
    process.exit(1);
  }
}
