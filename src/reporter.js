import chalk from 'chalk';
import boxen from 'boxen';

const DIVIDER = '─'.repeat(55);

/**
 * Determines whether the run should fail, and with which exit code.
 *
 * Precedence (first match wins the exit code, but `reasons` always
 * lists every condition that applies, for visibility):
 *   1. requiredMissing or missing -> exit 1 (always, unconditional)
 *   2. --strict escalating undocumented/unused -> exit 1
 *   3. invalid format (--validate-format) -> exit 2
 *   4. otherwise -> exit 0
 *
 * @param {{ missing: any[], undocumented: any[], unused: any[], requiredMissing?: any[] }} diffResult
 * @param {{ strict?: boolean, ignoreUnused?: boolean, invalidFormat?: any[] }} [options]
 * @returns {{ exitCode: number, shouldFail: boolean, reasons: string[] }}
 */
export function evaluateFailure(diffResult, options = {}) {
  const { strict = false, ignoreUnused = false, invalidFormat = [] } = options;
  const requiredMissing = diffResult.requiredMissing || [];
  const reasons = [];

  if (requiredMissing.length > 0) reasons.push('required-missing');
  if (diffResult.missing.length > 0) reasons.push('missing');
  if (strict && diffResult.undocumented.length > 0) reasons.push('undocumented');
  if (strict && !ignoreUnused && diffResult.unused.length > 0) reasons.push('unused');
  if (invalidFormat.length > 0) reasons.push('invalid-format');

  const hardFail = requiredMissing.length > 0 || diffResult.missing.length > 0
    || (strict && diffResult.undocumented.length > 0)
    || (strict && !ignoreUnused && diffResult.unused.length > 0);

  let exitCode = 0;
  if (hardFail) exitCode = 1;
  else if (invalidFormat.length > 0) exitCode = 2;

  return { exitCode, shouldFail: exitCode !== 0, reasons };
}

/**
 * Prints the final audit report to the terminal (human-readable mode).
 *
 * @param {{
 *   missing: { name: string, locations: string[], suggestion?: string|null }[],
 *   undocumented: { name: string }[],
 *   unused: { name: string }[],
 *   requiredMissing?: { name: string, locations: string[] }[]
 * }} diffResult
 * @param {{ filesScanned: number, timeMs: number, dir: string }} meta
 * @param {{
 *   ignoreUnused?: boolean, secrets?: { name: string, reason: string }[],
 *   gitignoreOk?: boolean|null, strict?: boolean,
 *   invalidFormat?: { name: string, expectedType: string, gotValue: string }[],
 *   healthScore?: { score: number, grade: string, bar: string },
 * }} [options]
 */
export function printReport(diffResult, meta, options = {}) {
  const { missing, undocumented, unused, requiredMissing = [] } = diffResult;
  const {
    ignoreUnused = false, secrets = [], gitignoreOk = null, strict = false,
    invalidFormat = [], healthScore = null,
  } = options;

  const showUnused = !ignoreUnused && unused.length > 0;
  const hasAnyIssues = missing.length > 0 || undocumented.length > 0 || showUnused
    || secrets.length > 0 || requiredMissing.length > 0 || invalidFormat.length > 0;

  console.log('');

  if (requiredMissing.length > 0) {
    printRequiredMissingSection(requiredMissing);
  }

  if (missing.length > 0) {
    printMissingSection(missing);
  }

  if (invalidFormat.length > 0) {
    printInvalidFormatSection(invalidFormat);
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

  const { reasons } = evaluateFailure(diffResult, { strict, ignoreUnused, invalidFormat });
  if (strict && reasons.some((r) => r === 'undocumented' || r === 'unused')) {
    console.log(chalk.red.bold(`✖ --strict: failing build due to ${reasons.join(', ')}`));
    console.log('');
  }

  printSummary(
    { missing, undocumented, unused: showUnused ? unused : [], secrets, requiredMissing, invalidFormat },
    meta,
    { strict }
  );

  if (healthScore) {
    printHealthScore(healthScore);
  }
}

function printRequiredMissingSection(requiredMissing) {
  console.log(chalk.red.bold(`🔴 REQUIRED + MISSING (${requiredMissing.length})`));
  console.log(chalk.dim(DIVIDER));
  for (const item of requiredMissing) {
    console.log(chalk.red(`❯ ${item.name}`) + chalk.dim(' (marked required in config)'));
    for (const location of item.locations) {
      console.log(chalk.dim(`    ${location}`));
    }
  }
  console.log('');
}

function printMissingSection(missing) {
  console.log(chalk.red.bold(`✖ MISSING (${missing.length}) — used in code but not in any .env file`));
  console.log(chalk.dim(DIVIDER));
  for (const item of missing) {
    console.log(chalk.red(`❯ ${item.name}`));
    for (const location of item.locations) {
      console.log(chalk.dim(`    ${location}`));
    }
    if (item.suggestion) {
      console.log(chalk.cyan(`    💡 Did you mean ${chalk.bold(item.suggestion)} instead of ${item.name}?`));
    }
  }
  console.log('');
}

function printInvalidFormatSection(invalidFormat) {
  console.log(chalk.red.bold(`✖ INVALID FORMAT (${invalidFormat.length})`));
  console.log(chalk.dim(DIVIDER));
  for (const item of invalidFormat) {
    console.log(chalk.red(`❯ ${item.name}`) + chalk.dim(` → expected ${item.expectedType}, got "${item.gotValue}"`));
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

function printSummary({ missing, undocumented, unused, secrets, requiredMissing, invalidFormat }, meta, { strict = false } = {}) {
  const { filesScanned, timeMs } = meta;
  const seconds = (timeMs / 1000).toFixed(1);

  const parts = [];
  if (requiredMissing && requiredMissing.length > 0) {
    parts.push(`${chalk.bold(requiredMissing.length)} required missing`);
  }
  parts.push(`${chalk.bold(missing.length)} missing`);
  if (invalidFormat && invalidFormat.length > 0) {
    parts.push(`${chalk.bold(invalidFormat.length)} invalid format`);
  }
  parts.push(`${chalk.bold(undocumented.length)} undocumented`);
  parts.push(`${chalk.bold(unused.length)} unused`);
  if (secrets && secrets.length > 0) {
    parts.push(`${chalk.bold(secrets.length)} potential secrets`);
  }

  console.log(chalk.dim(DIVIDER));
  console.log(parts.join('  ·  ') + (strict ? chalk.dim('  (strict mode)') : ''));
  console.log(chalk.dim(`Scanned ${chalk.bold(String(filesScanned))} files in ${seconds}s`));
  console.log(chalk.dim(DIVIDER));
  console.log('');
}

const GRADE_COLORS = { Excellent: 'green', Good: 'green', Fair: 'yellow', Critical: 'red' };

function printHealthScore(healthScore) {
  const { score, grade, bar } = healthScore;
  const color = GRADE_COLORS[grade] || 'white';
  const content = `Env Health Score: ${score}\n${bar}  ${grade}`;
  console.log(chalk[color](boxen(content, { padding: { left: 1, right: 1, top: 0, bottom: 0 }, borderColor: color, borderStyle: 'round' })));
}

/**
 * Builds a machine-readable JSON report (for --json / CI consumption).
 * Never printed with color codes or decorative characters.
 *
 * @param {ReturnType<typeof import('./diff.js').diffEnvVars>} diffResult
 * @param {{ filesScanned: number, timeMs: number, dir: string }} meta
 * @param {{
 *   secrets?: { name: string, reason: string }[], gitignoreOk?: boolean|null,
 *   strict?: boolean, ignoreUnused?: boolean,
 *   invalidFormat?: { name: string, expectedType: string, gotValue: string }[],
 *   healthScore?: { score: number, grade: string, bar: string }|null,
 *   reportPath?: string|null,
 * }} [options]
 * @returns {object}
 */
export function buildJsonReport(diffResult, meta, options = {}) {
  const {
    secrets = [], gitignoreOk = null, strict = false, ignoreUnused = false,
    invalidFormat = [], healthScore = null, reportPath = null,
  } = options;
  const { exitCode, shouldFail, reasons } = evaluateFailure(diffResult, { strict, ignoreUnused, invalidFormat });

  const report = {
    ok: !shouldFail,
    exitCode,
    strict,
    failReasons: reasons,
    requiredMissing: diffResult.requiredMissing || [],
    missing: diffResult.missing,
    invalidFormat,
    undocumented: diffResult.undocumented,
    unused: diffResult.unused,
    secrets,
    gitignoreProtectsEnv: gitignoreOk,
    meta: {
      dir: meta.dir,
      filesScanned: meta.filesScanned,
      timeMs: meta.timeMs,
      requiredMissingCount: (diffResult.requiredMissing || []).length,
      missingCount: diffResult.missing.length,
      invalidFormatCount: invalidFormat.length,
      undocumentedCount: diffResult.undocumented.length,
      unusedCount: diffResult.unused.length,
      secretsCount: secrets.length,
    },
  };

  if (healthScore) report.healthScore = healthScore;
  if (reportPath) report.reportPath = reportPath;

  return report;
}

export function printJsonReport(diffResult, meta, options = {}) {
  const report = buildJsonReport(diffResult, meta, options);
  console.log(JSON.stringify(report, null, 2));
}
