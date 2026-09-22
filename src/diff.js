import { isIgnored } from './config.js';

/**
 * Compares variables referenced in code against variables defined in
 * .env files and .env.example, producing categorized lists.
 *
 * @param {Object} params
 * @param {Map<string, string[]>} params.codeVars - varName -> file:line[] from scanner
 * @param {Set<string>} params.envVars - varName set from all .env* files
 * @param {Set<string>} params.exampleVars - varName set from .env.example only
 * @param {string[]} [params.ignore] - variable names/patterns to exclude entirely (from config)
 * @param {string[]} [params.required] - variable names that must exist in .env no matter what;
 *   bypasses `ignore` entirely and is reported in its own section, not folded into `missing`
 * @returns {{
 *   missing: { name: string, locations: string[] }[],
 *   undocumented: { name: string }[],
 *   unused: { name: string }[],
 *   requiredMissing: { name: string, locations: string[] }[]
 * }}
 */
export function diffEnvVars({ codeVars, envVars, exampleVars, ignore = [], required = [] }) {
  const missing = [];
  const undocumented = [];
  const unused = [];
  const requiredMissing = [];
  const requiredSet = new Set(required);

  // REQUIRED + MISSING: declared `required` in config but absent from
  // .env, regardless of whether it's ignored or even referenced in code.
  // This is checked independently of, and takes priority over, the
  // regular MISSING list below — a required var is never silently
  // suppressed by an `ignore` pattern.
  for (const name of requiredSet) {
    if (!envVars.has(name)) {
      requiredMissing.push({ name, locations: codeVars.get(name) || [] });
    }
  }
  requiredMissing.sort((a, b) => a.name.localeCompare(b.name));

  // MISSING: referenced in code but not defined in any .env file.
  // Vars already reported as REQUIRED + MISSING are excluded here to
  // avoid listing the same absence twice under two headings.
  for (const [name, locations] of codeVars.entries()) {
    if (requiredSet.has(name)) continue;
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

  return { missing, undocumented, unused, requiredMissing };
}
