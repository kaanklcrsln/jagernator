// Generates a synthetic repository with 400 modules so the answer requires search, not reading everything.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const areas = ['auth', 'billing', 'catalog', 'orders', 'shipping', 'users', 'reports', 'search'];
for (let i = 0; i < 400; i++) {
  const area = areas[i % areas.length];
  const dir = path.join(root, 'src', area);
  fs.mkdirSync(dir, { recursive: true });
  const body = Array.from({ length: 40 }, (_, j) => `export function ${area}Helper${i}_${j}(x) {\n  return x * ${j + 1} + ${i};\n}\n`).join('\n');
  fs.writeFileSync(path.join(dir, `module-${String(i).padStart(3, '0')}.js`), `// ${area} module ${i}\n${body}`);
}
fs.writeFileSync(
  path.join(root, 'src/billing/rules-eu.js'),
  "// Regional rules\nexport function computeInvoiceTax(invoice) {\n  return Math.round(invoice.net * invoice.rate * 100) / 100;\n}\n",
);
