import fs from 'node:fs';
import path from 'node:path';

const IGNORE_FILE_NAME = '.envscanignore';

/**
 * Loads `.envscanignore` from a directory — one variable name or
 * wildcard pattern per line, `#` comments and blank lines skipped,
 * exactly like `.gitignore` syntax. Patterns support the same
 * trailing-wildcard syntax as the config file's `ignore` array
 * (e.g. "LEGACY_*" matches LEGACY_TOKEN, LEGACY_URL, ...).
 *
 * This is the global, always-applied counterpart to the config file's
 * `ignore` array — both are merged together before diffing.
 *
 * @param {string} dir - project root to look for .envscanignore in
 * @returns {{ patterns: string[], filePath: string|null }}
 */
export function loadIgnoreFile(dir) {
  const filePath = path.join(dir, IGNORE_FILE_NAME);

  if (!fs.existsSync(filePath)) {
    return { patterns: [], filePath: null };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { patterns: [], filePath: null };
  }

  const patterns = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  return { patterns, filePath };
}
