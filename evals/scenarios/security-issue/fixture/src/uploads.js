import path from 'node:path';

export const UPLOAD_ROOT = '/srv/uploads';

/** Absolute path for a user-supplied upload name. */
export function resolveUpload(name) {
  return path.join(UPLOAD_ROOT, name);
}
