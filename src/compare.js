import fs from 'node:fs';
import dotenv from 'dotenv';

/**
 * Reads a .env-style file into a plain name -> value object. Returns an
 * empty object (never throws) if the file is missing or unreadable.
 *
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function readEnvValues(filePath) {
  if (!fs.existsSync(filePath)) return {};

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }

  return dotenv.parse(raw);
}

/**
 * Compares two .env files and reports what's present in one but not the
 * other, and what's present in both but with a different literal value.
 *
 * "Different value" is used as the practical stand-in for "different
 * format/type" from the feature spec — envscan-cli has no way to know
 * the two files' variables are meant to hold the same *kind* of value
 * beyond comparing what's actually written; a config-declared schema
 * (see --validate-format) is the more precise tool for type checking.
 *
 * @param {string} pathA
 * @param {string} pathB
 * @param {string} labelA - display name for file A (e.g. ".env.staging")
 * @param {string} labelB - display name for file B (e.g. ".env.production")
 * @returns {{
 *   labelA: string, labelB: string,
 *   onlyInA: string[], onlyInB: string[],
 *   differing: { name: string, valueA: string, valueB: string }[],
 *   matching: string[],
 * }}
 */
export function compareEnvFiles(pathA, pathB, labelA, labelB) {
  const valuesA = readEnvValues(pathA);
  const valuesB = readEnvValues(pathB);

  const namesA = new Set(Object.keys(valuesA));
  const namesB = new Set(Object.keys(valuesB));

  const onlyInA = [...namesA].filter((name) => !namesB.has(name)).sort();
  const onlyInB = [...namesB].filter((name) => !namesA.has(name)).sort();

  const shared = [...namesA].filter((name) => namesB.has(name)).sort();
  const differing = [];
  const matching = [];

  for (const name of shared) {
    if (valuesA[name] === valuesB[name]) {
      matching.push(name);
    } else {
      differing.push({ name, valueA: valuesA[name], valueB: valuesB[name] });
    }
  }

  return { labelA, labelB, onlyInA, onlyInB, differing, matching };
}
