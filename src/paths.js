import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the installed Jagernator package (holds policies/ and skills/). */
export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
