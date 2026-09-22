import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.development', '.env.production'];

const VALIDATORS = {
  string: () => true, // no-op — any value is a valid string

  number: (value) => {
    const trimmed = value.trim();
    if (trimmed === '') return false;
    return !Number.isNaN(Number(trimmed));
  },

  boolean: (value) => {
    return ['true', 'false'].includes(value.trim().toLowerCase());
  },

  url: (value) => {
    try {
      const parsed = new URL(value.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  },

  email: (value) => {
    // Deliberately simple — this is a sanity check, not full RFC 5322 validation.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  },
};

const TYPE_LABELS = {
  string: 'a string',
  number: 'number',
  boolean: 'boolean (true/false)',
  url: 'valid URL',
  email: 'valid email',
};

/**
 * Merges raw KEY=VALUE pairs across the standard .env files, later files
 * overriding earlier ones (same precedence order the rest of the tool
 * uses for names-only parsing in parser.js — this just keeps values too).
 *
 * @param {string} dir
 * @returns {Record<string, string>}
 */
function mergeRawEnvValues(dir) {
  const merged = {};

  for (const fileName of ENV_FILE_NAMES) {
    const fullPath = path.join(dir, fileName);
    if (!fs.existsSync(fullPath)) continue;

    let raw;
    try {
      raw = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    Object.assign(merged, dotenv.parse(raw));
  }

  return merged;
}

/**
 * Validates .env values against a `validate: { NAME: type }` schema from
 * the config file. Only variables that are both declared in the schema
 * AND actually present with a value are checked — a variable that's
 * simply absent is already covered by the MISSING check elsewhere.
 *
 * @param {string} dir - project root to read .env files from
 * @param {Record<string, string>} schema - e.g. { PORT: 'number', APP_URL: 'url' }
 * @returns {{ name: string, expectedType: string, gotValue: string }[]}
 */
export function validateEnvFormats(dir, schema) {
  const invalid = [];
  if (!schema || Object.keys(schema).length === 0) return invalid;

  const values = mergeRawEnvValues(dir);

  for (const [name, type] of Object.entries(schema)) {
    if (!(name in values)) continue; // absence is MISSING's job, not this check's

    const validator = VALIDATORS[type];
    if (!validator) continue; // unknown declared type — silently skip rather than crash

    const value = values[name];
    if (!validator(value)) {
      invalid.push({ name, expectedType: TYPE_LABELS[type] || type, gotValue: value });
    }
  }

  invalid.sort((a, b) => a.name.localeCompare(b.name));
  return invalid;
}

export const SUPPORTED_VALIDATION_TYPES = Object.keys(VALIDATORS);
