import fs from 'node:fs';
import path from 'node:path';

/**
 * Known high-confidence secret formats. Matched against the VALUE, not
 * the variable name — a value that looks like a live credential is
 * worth flagging regardless of what the developer named it.
 */
const SECRET_PATTERNS = [
  { label: 'AWS Access Key', regex: /^AKIA[0-9A-Z]{16}$/ },
  { label: 'Stripe Live Key', regex: /^sk_live_[0-9a-zA-Z]{16,}$/ },
  { label: 'Stripe Restricted Key', regex: /^rk_live_[0-9a-zA-Z]{16,}$/ },
  { label: 'GitHub Token', regex: /^gh[pousr]_[0-9a-zA-Z]{20,}$/ },
  { label: 'Slack Token', regex: /^xox[baprs]-[0-9a-zA-Z-]{10,}$/ },
  { label: 'Google API Key', regex: /^AIza[0-9A-Za-z\-_]{35}$/ },
  { label: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'JWT', regex: /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/ },
];

/** Variable-name substrings that make a high-entropy value worth flagging. */
const SENSITIVE_NAME_HINTS = ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'PRIVATE', 'CREDENTIAL', 'AUTH'];

/** Obvious placeholders that should never be flagged as leaked secrets. */
const PLACEHOLDER_VALUES = new Set([
  '', 'changeme', 'change_me', 'your-key-here', 'your_key_here', 'xxxx', 'todo',
  'placeholder', 'example', 'test', 'null', 'undefined', 'none',
]);

/**
 * Shannon entropy of a string, used to distinguish random-looking
 * credential values from ordinary words/URLs.
 */
function shannonEntropy(str) {
  const freq = {};
  for (const char of str) freq[char] = (freq[char] || 0) + 1;

  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function looksLikePlaceholder(value) {
  return PLACEHOLDER_VALUES.has(value.trim().toLowerCase());
}

/**
 * Scans raw KEY=VALUE pairs from a .env file for values that look like
 * real, live secrets rather than placeholders.
 *
 * @param {string} filePath - path to a real .env file (never .env.example)
 * @returns {{ name: string, reason: string }[]}
 */
export function detectSecretLeaks(filePath) {
  const findings = [];

  if (!fs.existsSync(filePath)) return findings;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return findings;
  }

  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const name = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    value = value.replace(/^["']|["']$/g, '');

    if (!value || looksLikePlaceholder(value)) continue;

    const knownMatch = SECRET_PATTERNS.find((p) => p.regex.test(value));
    if (knownMatch) {
      findings.push({ name, reason: knownMatch.label });
      continue;
    }

    const nameLooksSensitive = SENSITIVE_NAME_HINTS.some((hint) => name.toUpperCase().includes(hint));
    if (nameLooksSensitive && value.length >= 20 && shannonEntropy(value) >= 3.5) {
      findings.push({ name, reason: 'high-entropy value' });
    }
  }

  return findings;
}

/**
 * Checks whether `.env` is actually protected by .gitignore in the
 * target project. Returns false (i.e. a warning is warranted) if no
 * .gitignore exists, or it exists but doesn't cover .env.
 *
 * @param {string} dir - project root
 * @returns {boolean}
 */
export function isEnvGitIgnored(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return false;

  let contents;
  try {
    contents = fs.readFileSync(gitignorePath, 'utf8');
  } catch {
    return false;
  }

  const patterns = contents
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  return patterns.some((p) => p === '.env' || p === '.env*' || p === '/.env' || p === '.env/');
}
