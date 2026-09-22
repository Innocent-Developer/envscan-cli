import fs from 'node:fs';
import path from 'node:path';

const HOOK_MARKER = '# Installed by envscan-cli install-hook — safe to remove with `npx envscan-cli uninstall-hook`';

const HOOK_CONTENT = `#!/bin/sh
${HOOK_MARKER}
npx envscan-cli --no-banner --ignore-unused
if [ $? -ne 0 ]; then
  echo "envscan-cli: commit blocked — fix missing env vars first"
  exit 1
fi
`;

/**
 * Installs a pre-commit git hook that blocks commits when envscan-cli
 * finds missing environment variables. If a pre-commit hook already
 * exists and wasn't created by envscan-cli, it's backed up first rather
 * than silently overwritten.
 *
 * @param {string} dir - project root (must contain a .git directory)
 * @returns {{ ok: boolean, message: string, hookPath?: string, backupPath?: string }}
 */
export function installHook(dir) {
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    return { ok: false, message: `Not a git repository (no .git directory found in ${dir}).` };
  }

  const hooksDir = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, 'pre-commit');

  let backupPath;
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (!existing.includes(HOOK_MARKER)) {
      backupPath = path.join(hooksDir, 'pre-commit.pre-envscan-cli-backup');
      fs.writeFileSync(backupPath, existing, 'utf8');
    }
  }

  fs.writeFileSync(hookPath, HOOK_CONTENT, 'utf8');
  fs.chmodSync(hookPath, 0o755);

  return {
    ok: true,
    message: 'Pre-commit hook installed at .git/hooks/pre-commit',
    hookPath,
    backupPath,
  };
}

/**
 * Removes the envscan-cli pre-commit hook, restoring a previous hook
 * from backup if `installHook` made one. Refuses to touch a pre-commit
 * hook that doesn't carry the envscan-cli marker, since that means
 * envscan-cli didn't create it.
 *
 * @param {string} dir - project root
 * @returns {{ ok: boolean, message: string }}
 */
export function uninstallHook(dir) {
  const hooksDir = path.join(dir, '.git', 'hooks');
  const hookPath = path.join(hooksDir, 'pre-commit');
  const backupPath = path.join(hooksDir, 'pre-commit.pre-envscan-cli-backup');

  if (!fs.existsSync(hookPath)) {
    return { ok: false, message: 'No pre-commit hook is installed.' };
  }

  const existing = fs.readFileSync(hookPath, 'utf8');
  if (!existing.includes(HOOK_MARKER)) {
    return { ok: false, message: 'The existing pre-commit hook was not installed by envscan-cli — leaving it untouched.' };
  }

  fs.rmSync(hookPath);

  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, hookPath);
    fs.chmodSync(hookPath, 0o755);
    return { ok: true, message: 'envscan-cli pre-commit hook removed; your previous hook has been restored.' };
  }

  return { ok: true, message: 'envscan-cli pre-commit hook removed.' };
}
