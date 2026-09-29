import path from 'node:path';

export const UPLOAD_ROOT = '/srv/uploads';

/** Absolute path for a user-supplied upload name. Throws if it escapes UPLOAD_ROOT. */
export function resolveUpload(name) {
  const resolved = path.resolve(UPLOAD_ROOT, name);
  if (path.isAbsolute(name) || !resolved.startsWith(UPLOAD_ROOT + path.sep)) throw new Error('invalid upload path');
  return resolved;
}
