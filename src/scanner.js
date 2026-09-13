import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

// @babel/traverse's default export shape differs between CJS/ESM
// interop modes depending on the bundler/runtime. Normalize it here.
const _traverse = traverse.default ?? traverse;

const SCAN_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx'];
const IGNORE_DIRS = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/coverage/**'];

/**
 * Scans a directory tree for all `process.env.SOME_VAR` references and
 * returns a map of variable name -> list of "file:line" locations where
 * it was referenced.
 *
 * @param {string} dir - root directory to scan
 * @returns {Promise<{ codeVars: Map<string, string[]>, filesScanned: number }>}
 */
export async function scanCodebase(dir) {
  const pattern = `**/*.{${SCAN_EXTENSIONS.join(',')}}`;

  const files = await glob(pattern, {
    cwd: dir,
    ignore: IGNORE_DIRS,
    absolute: true,
    nodir: true,
  });

  const codeVars = new Map();

  for (const filePath of files) {
    let source;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    let ast;
    try {
      ast = parse(source, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
        errorRecovery: true,
      });
    } catch {
      // Unparseable file (syntax error, unsupported syntax, binary, etc.)
      // — skip silently and keep scanning the rest of the codebase.
      continue;
    }

    const relativePath = path.relative(dir, filePath);

    try {
      _traverse(ast, {
        MemberExpression(nodePath) {
          const node = nodePath.node;

          const object = node.object;
          const property = node.property;

          if (!object || object.type !== 'MemberExpression') return;
          if (!property || property.type !== 'Identifier') return;

          const innerObject = object.object;
          const innerProperty = object.property;

          const isProcess = innerObject && innerObject.type === 'Identifier' && innerObject.name === 'process';
          const isEnv = innerProperty && innerProperty.type === 'Identifier' && innerProperty.name === 'env';

          if (!isProcess || !isEnv) return;

          const varName = property.name;
          const line = node.loc ? node.loc.start.line : '?';
          const location = `${relativePath}:${line}`;

          if (!codeVars.has(varName)) {
            codeVars.set(varName, []);
          }
          codeVars.get(varName).push(location);
        },
      });
    } catch {
      // Traversal error on a partially-recovered AST — skip this file's
      // findings rather than crashing the whole scan.
      continue;
    }
  }

  return { codeVars, filesScanned: files.length };
}
