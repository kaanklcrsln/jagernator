import fs from 'node:fs';

const answer = fs.existsSync('ANSWER.txt') ? fs.readFileSync('ANSWER.txt', 'utf8').trim().replace(/^\.\//, '') : '';
if (answer !== 'src/billing/rules-eu.js') {
  console.error(`expected src/billing/rules-eu.js, got "${answer}"`);
  process.exit(1);
}
