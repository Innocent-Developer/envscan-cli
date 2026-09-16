import chokidar from 'chokidar';
import chalk from 'chalk';

const WATCH_GLOBS = ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/.env*'];
const WATCH_IGNORED = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/coverage/**'];
const DEBOUNCE_MS = 250;

/**
 * Watches a directory for changes to source files or .env files and
 * re-runs `runAudit` on every change, debounced to avoid re-scanning
 * mid-save-burst.
 *
 * @param {string} dir - directory to watch
 * @param {() => Promise<void>} runAudit - callback that performs one full scan + report
 */
export function startWatch(dir, runAudit) {
  console.log(chalk.cyan(`👀 Watching ${dir} for changes... (Ctrl+C to stop)`));

  let timer = null;
  const scheduleRun = (changedPath) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      console.clear();
      console.log(chalk.dim(`Change detected: ${changedPath}`));
      await runAudit();
      console.log(chalk.cyan('👀 Watching for changes... (Ctrl+C to stop)'));
    }, DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(WATCH_GLOBS, {
    cwd: dir,
    ignored: WATCH_IGNORED,
    ignoreInitial: true,
  });

  watcher.on('add', scheduleRun);
  watcher.on('change', scheduleRun);
  watcher.on('unlink', scheduleRun);

  process.on('SIGINT', () => {
    watcher.close();
    console.log(chalk.dim('\nStopped watching.'));
    process.exit(0);
  });

  return watcher;
}
