import chalk from 'chalk';

const DIVIDER = '─'.repeat(55);

/**
 * Prints the final audit report to the terminal (human-readable mode).
 *
 * @param {{
 *   missing: { name: string, locations: string[] }[],
 *   undocumented: { name: string }[],
 *   unused: { name: string }[]
 * }} diffResult
 * @param {{ filesScanned: number, timeMs: number, dir: string }} meta
 * @param {{ ignoreUnused?: boolean, secrets?: { name: string, reason: string }[], gitignoreOk?: boolean|null }} [options]
 */
export function printReport(diffResult, meta, options = {}) {
  const { missing, undocumented, unused } = diffResult;
  const { ignoreUnused = false, secrets = [], gitignoreOk = null } = options;

  const showUnused = !ignoreUnused && unused.length > 0;
  const hasAnyIssues = missing.length > 0 || undocumented.length > 0 || showUnused || secrets.length > 0;

  console.log('');

  if (missing.length > 0) {
    printMissingSection(missing);
  }

  if (undocumented.length > 0) {
    printUndocumentedSection(undocumented);
  }

  if (showUnused) {
    printUnusedSection(unused);
  }

  if (secrets.length > 0) {
    printSecretsSection(secrets);
  }

  if (gitignoreOk === false) {
    console.log(chalk.red.bold('🔓 SECURITY — .env is not covered by .gitignore. It can be committed by accident.'));
    console.log('');
  }

  if (!hasAnyIssues) {
    console.log(chalk.green.bold('✔ All environment variables are accounted for.'));
    console.log('');
  }

  printSummary({ missing, undocumented, unused: showUnused ? unused : [], secrets }, meta);
}

function printMissingSection(missing) {
  console.log(chalk.red.bold(`✖ MISSING (${missing.length}) — used in code but not in any .env file`));
  console.log(chalk.dim(DIVIDER));
  for (const item of missing) {
    console.log(chalk.red(`❯ ${item.name}`));
    for (const location of item.locations) {
      console.log(chalk.dim(`    ${location}`));
    }
  }
  console.log('');
}

function printUndocumentedSection(undocumented) {
  console.log(chalk.yellow.bold(`⚠ UNDOCUMENTED (${undocumented.length}) — in .env but not in .env.example`));
  console.log(chalk.dim(DIVIDER));
  for (const item of undocumented) {
    console.log(chalk.yellow(`❯ ${item.name}`));
  }
  console.log('');
}

function printUnusedSection(unused) {
  console.log(chalk.dim.bold(`○ UNUSED (${unused.length}) — defined in .env but never used in code`));
  console.log(chalk.dim(DIVIDER));
  for (const item of unused) {
    console.log(chalk.dim(`❯ ${item.name}`));
  }
  console.log('');
}

function printSecretsSection(secrets) {
  console.log(chalk.magenta.bold(`🔒 POTENTIAL SECRET LEAK (${secrets.length}) — real-looking values in .env`));
  console.log(chalk.dim(DIVIDER));
  for (const item of secrets) {
    console.log(chalk.magenta(`❯ ${item.name}`) + chalk.dim(`  (${item.reason})`));
  }
  console.log('');
}

function printSummary({ missing, undocumented, unused, secrets }, meta) {
  const { filesScanned, timeMs } = meta;
  const seconds = (timeMs / 1000).toFixed(1);

  const parts = [
    `${chalk.bold(missing.length)} missing`,
    `${chalk.bold(undocumented.length)} undocumented`,
    `${chalk.bold(unused.length)} unused`,
  ];
  if (secrets && secrets.length > 0) {
    parts.push(`${chalk.bold(secrets.length)} potential secrets`);
  }

  console.log(chalk.dim(DIVIDER));
  console.log(parts.join('  ·  '));
  console.log(chalk.dim(`Scanned ${chalk.bold(String(filesScanned))} files in ${seconds}s`));
  console.log(chalk.dim(DIVIDER));
  console.log('');
}

/**
 * Builds a machine-readable JSON report (for --json / CI consumption).
 * Never printed with color codes or decorative characters.
 *
 * @param {ReturnType<typeof import('./diff.js').diffEnvVars>} diffResult
 * @param {{ filesScanned: number, timeMs: number, dir: string }} meta
 * @param {{ secrets?: { name: string, reason: string }[], gitignoreOk?: boolean|null }} [options]
 * @returns {object}
 */
export function buildJsonReport(diffResult, meta, options = {}) {
  const { secrets = [], gitignoreOk = null } = options;

  return {
    ok: diffResult.missing.length === 0,
    missing: diffResult.missing,
    undocumented: diffResult.undocumented,
    unused: diffResult.unused,
    secrets,
    gitignoreProtectsEnv: gitignoreOk,
    meta: {
      dir: meta.dir,
      filesScanned: meta.filesScanned,
      timeMs: meta.timeMs,
      missingCount: diffResult.missing.length,
      undocumentedCount: diffResult.undocumented.length,
      unusedCount: diffResult.unused.length,
      secretsCount: secrets.length,
    },
  };
}

export function printJsonReport(diffResult, meta, options = {}) {
  const report = buildJsonReport(diffResult, meta, options);
  console.log(JSON.stringify(report, null, 2));
}
