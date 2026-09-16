import { isIgnored } from './config.js';

/**
 * Compares variables referenced in code against variables defined in
 * .env files and .env.example, producing three categorized lists.
 *
 * @param {Object} params
 * @param {Map<string, string[]>} params.codeVars - varName -> file:line[] from scanner
 * @param {Set<string>} params.envVars - varName set from all .env* files
 * @param {Set<string>} params.exampleVars - varName set from .env.example only
 * @param {string[]} [params.ignore] - variable names/patterns to exclude entirely (from config)
 * @returns {{
 *   missing: { name: string, locations: string[] }[],
 *   undocumented: { name: string }[],
 *   unused: { name: string }[]
 * }}
 */
export function diffEnvVars({ codeVars, envVars, exampleVars, ignore = [] }) {
  const missing = [];
  const undocumented = [];
  const unused = [];

  // MISSING: referenced in code but not defined in any .env file
  for (const [name, locations] of codeVars.entries()) {
    if (isIgnored(name, ignore)) continue;
    if (!envVars.has(name)) {
      missing.push({ name, locations });
    }
  }

  // UNDOCUMENTED: defined in .env, actively used in code, but absent
  // from .env.example. Vars that are unused are reported under UNUSED
  // instead — flagging them as undocumented too would be noise, since
  // documenting a dead variable isn't actionable.
  for (const name of envVars) {
    if (isIgnored(name, ignore)) continue;
    if (codeVars.has(name) && !exampleVars.has(name)) {
      undocumented.push({ name });
    }
  }

  // UNUSED: defined in .env but never referenced anywhere in code
  for (const name of envVars) {
    if (isIgnored(name, ignore)) continue;
    if (!codeVars.has(name)) {
      unused.push({ name });
    }
  }

  // Deterministic, readable output
  missing.sort((a, b) => a.name.localeCompare(b.name));
  undocumented.sort((a, b) => a.name.localeCompare(b.name));
  unused.sort((a, b) => a.name.localeCompare(b.name));

  return { missing, undocumented, unused };
}
