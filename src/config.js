import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG_FILE_CANDIDATES = ['envscan-cli.config.js', 'envscan-cli.config.mjs', '.envscan-clirc.json'];

const DEFAULT_CONFIG = {
  ignore: [], // variable names, supports trailing wildcard e.g. "OLD_*"
  exampleFile: '.env.example',
  ignoreUnused: false,
  secretDetection: true,
  required: [], // var names that must exist in .env; always fails the build if absent
  validate: {}, // { VAR_NAME: 'number'|'boolean'|'url'|'email'|'string' } — used by --validate-format
};

/**
 * Loads envscan-cli's config file (if present) and merges it with CLI
 * overrides. CLI flags always win over the config file.
 *
 * Supported files (checked in order, first match wins), all resolved
 * relative to `dir`:
 *   - envscan-cli.config.js / .mjs  (export default {...})
 *   - .envscan-clirc.json
 *
 * @param {string} dir - project root to look for a config file in
 * @param {{ configPath?: string, ignoreUnused?: boolean, exampleFile?: string }} cliOverrides
 * @returns {Promise<{ ignore: string[], exampleFile: string, ignoreUnused: boolean, secretDetection: boolean, sourceFile: string|null }>}
 */
export async function loadConfig(dir, cliOverrides = {}) {
  let loaded = {};
  let sourceFile = null;

  const explicitPath = cliOverrides.configPath ? path.resolve(cliOverrides.configPath) : null;
  const candidatePaths = explicitPath
    ? [explicitPath]
    : CONFIG_FILE_CANDIDATES.map((name) => path.join(dir, name));

  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;

    try {
      if (candidate.endsWith('.json')) {
        loaded = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      } else {
        const mod = await import(pathToFileURL(candidate).href);
        loaded = mod.default ?? mod;
      }
      sourceFile = candidate;
      break;
    } catch (err) {
      throw new Error(`Failed to load config file "${candidate}": ${err.message}`);
    }
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...loaded,
    ...(cliOverrides.ignoreUnused !== undefined ? { ignoreUnused: cliOverrides.ignoreUnused } : {}),
    ...(cliOverrides.exampleFile ? { exampleFile: cliOverrides.exampleFile } : {}),
  };

  merged.ignore = Array.isArray(merged.ignore) ? merged.ignore : [];
  merged.required = Array.isArray(merged.required) ? merged.required : [];
  merged.validate = (merged.validate && typeof merged.validate === 'object') ? merged.validate : {};
  merged.sourceFile = sourceFile;

  return merged;
}

/**
 * Converts a simple wildcard pattern ("OLD_*", "*_DEBUG") into a RegExp.
 * Only `*` is treated as a wildcard; everything else is matched literally.
 */
function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Returns true if `name` matches any entry in `patterns` (exact match or
 * wildcard match, e.g. "OLD_*" matches "OLD_TOKEN").
 *
 * @param {string} name
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function isIgnored(name, patterns) {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => patternToRegExp(pattern).test(name));
}
