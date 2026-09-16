import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * List of .env style files that are considered "environment definitions"
 * for the purposes of the MISSING / UNUSED checks. .env.example is
 * intentionally excluded here — it is only used for the UNDOCUMENTED check.
 */
const ENV_FILE_NAMES = ['.env', '.env.local', '.env.development', '.env.production'];

/**
 * Parses a single .env style file and returns the set of variable
 * NAMES defined in it. Values are intentionally discarded — envscan-cli
 * never needs to read secret values, only which keys exist.
 *
 * @param {string} filePath - absolute or relative path to a .env file
 * @returns {Set<string>} set of variable names, empty if file is missing
 */
export function parseEnvFile(filePath) {
  const names = new Set();

  if (!filePath || !fs.existsSync(filePath)) {
    return names;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    // Unreadable file (permissions, race condition, etc.) — treat as empty
    return names;
  }

  const parsed = dotenv.parse(raw);
  for (const key of Object.keys(parsed)) {
    names.add(key);
  }

  return names;
}

/**
 * Finds and parses all standard .env files in a directory and returns
 * a single combined Set of every variable name defined across them.
 *
 * @param {string} dir - project root directory to look for .env files in
 * @returns {{ vars: Set<string>, filesFound: string[] }}
 */
export function parseAllEnvFiles(dir) {
  const combined = new Set();
  const filesFound = [];

  for (const fileName of ENV_FILE_NAMES) {
    const fullPath = path.join(dir, fileName);
    if (fs.existsSync(fullPath)) {
      filesFound.push(fileName);
      const vars = parseEnvFile(fullPath);
      for (const name of vars) {
        combined.add(name);
      }
    }
  }

  return { vars: combined, filesFound };
}
