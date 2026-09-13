import chalk from 'chalk';

const DIVIDER = '─'.repeat(55);

/**
 * Prints the final audit report to the terminal.
 *
 * @param {{
 *   missing: { name: string, locations: string[] }[],
 *   undocumented: { name: string }[],
 *   unused: { name: string }[]
 * }} diffResult
 * @param {{ filesScanned: number, timeMs: number, dir: string }} meta
 * @param {{ ignoreUnused?: boolean }} [options]
 */
export function printReport(diffResult, meta, options = {}) {
  const { missing, undocumented, unused } = diffResult;
  const { ignoreUnused = false } = options;

  const showUnused = !ignoreUnused && unused.length > 0;
  const hasAnyIssues = missing.length > 0 || undocumented.length > 0 || showUnused;

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

  if (!hasAnyIssues) {
    console.log(chalk.green.bold('✔ All environment variables are accounted for.'));
    console.log('');
  }

  printSummary({ missing, undocumented, unused: showUnused ? unused : [] }, meta);
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

function printSummary({ missing, undocumented, unused }, meta) {
  const { filesScanned, timeMs } = meta;
  const seconds = (timeMs / 1000).toFixed(1);

  console.log(chalk.dim(DIVIDER));
  console.log(
    `${chalk.bold(missing.length)} missing  ·  ${chalk.bold(undocumented.length)} undocumented  ·  ${chalk.bold(unused.length)} unused`
  );
  console.log(chalk.dim(`Scanned ${chalk.bold(String(filesScanned))} files in ${seconds}s`));
  console.log(chalk.dim(DIVIDER));
  console.log('');
}
