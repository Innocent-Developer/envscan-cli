import fs from 'node:fs';

/**
 * Auto-fixes a .env.example file by appending placeholder entries for:
 *   - variables that are undocumented (in .env, missing from .env.example)
 *   - variables that are missing entirely (used in code, in no .env file)
 *
 * Never touches the real .env file — only .env.example, which is meant
 * to be committed and contains no real values.
 *
 * @param {string} examplePath - path to .env.example (created if absent)
 * @param {{ undocumented: {name: string}[], missing: {name: string}[] }} diffResult
 * @returns {{ added: string[], filePath: string }}
 */
export function autoFixExampleFile(examplePath, diffResult) {
  const existing = fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '';
  const existingNames = new Set(
    existing
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0].trim())
  );

  const toAdd = [];

  for (const { name } of diffResult.undocumented) {
    if (!existingNames.has(name)) {
      toAdd.push(name);
      existingNames.add(name);
    }
  }

  for (const { name } of diffResult.missing) {
    if (!existingNames.has(name)) {
      toAdd.push(name);
      existingNames.add(name);
    }
  }

  if (toAdd.length === 0) {
    return { added: [], filePath: examplePath };
  }

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  const additionBlock = toAdd.map((name) => `${name}=`).join('\n');

  const newContent =
    existing.length === 0
      ? `${additionBlock}\n`
      : `${existing}${needsLeadingNewline ? '\n' : ''}${additionBlock}\n`;

  fs.writeFileSync(examplePath, newContent, 'utf8');

  return { added: toAdd, filePath: examplePath };
}
