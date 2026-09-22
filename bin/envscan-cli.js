#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';

import { parseEnvFile, parseAllEnvFiles } from '../src/parser.js';
import { scanCodebase } from '../src/scanner.js';
import { diffEnvVars } from '../src/diff.js';
import { printReport, printJsonReport, evaluateFailure } from '../src/reporter.js';
import { loadConfig } from '../src/config.js';
import { loadIgnoreFile } from '../src/ignorefile.js';
import { autoFixExampleFile } from '../src/fixer.js';
import { generateGitHubAction } from '../src/ci.js';
import { startWatch } from '../src/watch.js';
import { detectSecretLeaks, isEnvGitIgnored } from '../src/secrets.js';
import { findClosestMatch } from '../src/suggest.js';
import { validateEnvFormats } from '../src/validator.js';
import { compareEnvFiles } from '../src/compare.js';
import { calculateHealthScore } from '../src/scorer.js';
import { generateHtmlReport } from '../src/htmlreport.js';
import { installHook, uninstallHook } from '../src/hookinstaller.js';
import { runInitWizard } from '../src/wizard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.development', '.env.production'];

const program = new Command();

program
  .name('envscan-cli')
  .description('Audit environment variables in a Node.js project')
  .version(pkg.version, '-v, --version', 'Show version')
  .option('-d, --dir <path>', 'Directory to scan', process.cwd())
  .option('-e, --example <path>', '.env.example path')
  .option('-c, --config <path>', 'Path to a specific config file')
  .option('--ignore-unused', 'Suppress unused warnings', false)
  .option('--no-banner', 'Hide banner')
  .option('--fix', 'Auto-fix: add missing/undocumented vars to .env.example', false)
  .option('--json', 'Output a machine-readable JSON report instead of the CLI report', false)
  .option('--no-secrets', 'Disable secret-leak detection')
  .option('-w, --watch', 'Watch for file changes and re-run automatically', false)
  .option('--strict', 'Fail the build on undocumented and unused vars too, not just missing', false)
  .option('--suggest', 'Suggest the closest .env.example name for each missing var (typo detection)', false)
  .option('--validate-format', 'Validate .env values against the `validate` schema in your config file', false)
  .option('--compare <files...>', 'Compare two .env files, e.g. --compare .env.staging .env.production')
  .option('--stats', 'Show a 0-100 environment-hygiene health score', false)
  .option('--report <format>', 'Generate a shareable report file (supported: html)')
  .option('--init', 'Run the interactive setup wizard to generate .env.example and a config file')
  .addHelpText(
    'after',
    `
Examples:
  $ npx envscan-cli
  $ npx envscan-cli --dir ./backend
  $ npx envscan-cli --dir ./app --example .env.example.ci
  $ npx envscan-cli --fix
  $ npx envscan-cli --json > report.json
  $ npx envscan-cli --watch
  $ npx envscan-cli --strict
  $ npx envscan-cli --suggest
  $ npx envscan-cli --validate-format
  $ npx envscan-cli --compare .env.staging .env.production
  $ npx envscan-cli --stats
  $ npx envscan-cli --report html
  $ npx envscan-cli --init
  $ npx envscan-cli init-ci
  $ npx envscan-cli install-hook
  $ npx envscan-cli uninstall-hook
`
  );

program
  .command('init-ci')
  .description('Generate a GitHub Actions workflow that runs envscan-cli on push/PR')
  .action(function () {
    // Reuses the root -d/--dir option rather than redeclaring it, so
    // `envscan-cli init-ci --dir X` and `envscan-cli --dir X init-ci`
    // both resolve to the same directory instead of silently colliding.
    const globalOpts = this.optsWithGlobals();
    const targetDir = path.resolve(globalOpts.dir || process.cwd());
    const { filePath, created } = generateGitHubAction(targetDir);
    const relPath = path.relative(targetDir, filePath);

    if (created) {
      console.log(chalk.green.bold(`✔ Created ${relPath}`));
    } else {
      console.log(chalk.yellow.bold(`⚠ ${relPath} already exists — left untouched.`));
    }
  });

program
  .command('install-hook')
  .description('Install a pre-commit git hook that blocks commits with missing env vars')
  .action(function () {
    const targetDir = path.resolve(this.optsWithGlobals().dir || process.cwd());
    const result = installHook(targetDir);
    if (!result.ok) {
      console.log(chalk.red.bold(`✖ ${result.message}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green.bold(`✔ ${result.message}`));
    if (result.backupPath) {
      console.log(chalk.dim(`  Your previous hook was backed up to ${path.relative(targetDir, result.backupPath)}`));
    }
    console.log(chalk.dim('Commits will now be blocked if env vars are missing.'));
  });

program
  .command('uninstall-hook')
  .description('Remove the envscan-cli pre-commit git hook')
  .action(function () {
    const targetDir = path.resolve(this.optsWithGlobals().dir || process.cwd());
    const result = uninstallHook(targetDir);
    if (!result.ok) {
      console.log(chalk.yellow.bold(`⚠ ${result.message}`));
      return;
    }
    console.log(chalk.green.bold(`✔ ${result.message}`));
  });

// Root command needs its own explicit action: Commander only treats
// invocation-with-no-subcommand as "run the root" when one is registered
// here — otherwise, since subcommands exist, it falls back to help.
program.action(async (cmdOptions) => {
  await main(cmdOptions);
});

await program.parseAsync(process.argv);

async function main(options) {
  const targetDir = path.resolve(options.dir);
  const jsonMode = Boolean(options.json);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    if (jsonMode) {
      console.log(JSON.stringify({ error: `Directory not found: ${options.dir}` }, null, 2));
    } else {
      console.log(chalk.red.bold(`✖ Error: Directory not found → "${options.dir}"`));
    }
    process.exit(1);
  }

  // --init: interactive wizard is a self-contained mode — no banner, no
  // config loading, no normal audit flow.
  if (options.init) {
    if (!jsonMode) console.log('');
    await runInitWizard(targetDir);
    return;
  }

  let config;
  try {
    config = await loadConfig(targetDir, {
      configPath: options.config,
      ignoreUnused: options.ignoreUnused,
      exampleFile: options.example,
    });
  } catch (err) {
    console.log(chalk.red.bold(`✖ ${err.message}`));
    process.exit(1);
    return;
  }

  // .envscanignore is a global, always-applied ignore list — merge its
  // patterns in alongside whatever the config file specified.
  const { patterns: ignoreFilePatterns } = loadIgnoreFile(targetDir);
  config.ignore = [...new Set([...config.ignore, ...ignoreFilePatterns])];

  // --compare: a standalone comparison mode between two .env files —
  // does not run the normal missing/undocumented/unused audit at all.
  if (options.compare) {
    runCompareMode(targetDir, options, jsonMode);
    return;
  }

  if (options.banner && !jsonMode) {
    printBanner(pkg.version);
  }

  const runOnce = async () => {
    await runAudit(targetDir, options, config, jsonMode);
  };

  if (options.watch) {
    await runOnce();
    startWatch(targetDir, runOnce);
    // Keep the process alive — startWatch registers its own SIGINT handler.
    await new Promise(() => {});
    return;
  }

  await runOnce();
}

function runCompareMode(targetDir, options, jsonMode) {
  const files = options.compare;
  if (!Array.isArray(files) || files.length !== 2) {
    const message = '--compare requires exactly two file paths, e.g. --compare .env.staging .env.production';
    if (jsonMode) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.log(chalk.red.bold(`✖ ${message}`));
    }
    process.exitCode = 1;
    return;
  }

  const [fileA, fileB] = files;
  const pathA = path.resolve(targetDir, fileA);
  const pathB = path.resolve(targetDir, fileB);
  const result = compareEnvFiles(pathA, pathB, fileA, fileB);

  if (jsonMode) {
    console.log(JSON.stringify({
      compare: result,
      summary: {
        matching: result.matching.length,
        differing: result.differing.length,
        missing: result.onlyInA.length + result.onlyInB.length,
      },
    }, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.bold(`Comparing ${fileA} ↔ ${fileB}`));
  console.log(chalk.dim('─'.repeat(55)));

  if (result.onlyInA.length > 0) {
    console.log(chalk.yellow.bold(`\nIn ${fileA} but not ${fileB} (${result.onlyInA.length})`));
    for (const name of result.onlyInA) console.log(chalk.yellow(`❯ ${name}`));
  }

  if (result.onlyInB.length > 0) {
    console.log(chalk.yellow.bold(`\nIn ${fileB} but not ${fileA} (${result.onlyInB.length})`));
    for (const name of result.onlyInB) console.log(chalk.yellow(`❯ ${name}`));
  }

  if (result.differing.length > 0) {
    console.log(chalk.red.bold(`\nPresent in both, different value (${result.differing.length})`));
    for (const item of result.differing) {
      console.log(chalk.red(`❯ ${item.name}`) + chalk.dim(`  ${fileA}="${item.valueA}"  ${fileB}="${item.valueB}"`));
    }
  }

  console.log('');
  console.log(chalk.dim('─'.repeat(55)));
  console.log(
    `${chalk.bold(result.matching.length)} match  ·  ${chalk.bold(result.differing.length)} differ  ·  ${chalk.bold(result.onlyInA.length + result.onlyInB.length)} missing`
  );
  console.log(chalk.dim('─'.repeat(55)));
  console.log('');
}

async function runAudit(targetDir, options, config, jsonMode) {
  if (!jsonMode) {
    console.log(chalk.dim(`Scanning: ${targetDir}`));
  }

  const spinner = jsonMode ? null : ora('Scanning your codebase...').start();
  const startTime = Date.now();

  let codeVars;
  let filesScanned;

  try {
    const scanResult = await scanCodebase(targetDir);
    codeVars = scanResult.codeVars;
    filesScanned = scanResult.filesScanned;
  } catch (err) {
    if (spinner) spinner.fail('Scan failed.');
    if (jsonMode) {
      console.log(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.log(chalk.red.bold(`✖ Error: ${err.message}`));
    }
    process.exit(1);
    return;
  }

  const { vars: envVars, filesFound } = parseAllEnvFiles(targetDir);

  const examplePath = options.example
    ? path.resolve(options.example)
    : path.join(targetDir, config.exampleFile || '.env.example');
  const exampleVars = parseEnvFile(examplePath);
  const hasExampleFile = fs.existsSync(examplePath);

  const timeMs = Date.now() - startTime;
  if (spinner) spinner.stop();

  if (!jsonMode && filesScanned === 0) {
    console.log(chalk.yellow.bold('⚠ No JavaScript or TypeScript files found.'));
  }

  if (!jsonMode && filesFound.length === 0) {
    console.log(chalk.yellow.bold('⚠ No .env file found. Checking code references only.'));
  }

  const diffResult = diffEnvVars({ codeVars, envVars, exampleVars, ignore: config.ignore, required: config.required });

  // --fix: write missing/undocumented vars into .env.example before reporting
  if (options.fix) {
    const { added } = autoFixExampleFile(examplePath, diffResult);
    if (added.length > 0) {
      const refreshedExampleVars = parseEnvFile(examplePath);
      const refreshedDiff = diffEnvVars({ codeVars, envVars, exampleVars: refreshedExampleVars, ignore: config.ignore, required: config.required });
      Object.assign(diffResult, refreshedDiff);
      if (!jsonMode) {
        console.log(chalk.green.bold(`✔ --fix: added ${added.length} variable(s) to ${path.relative(targetDir, examplePath)}`));
        console.log(chalk.dim(`    ${added.join(', ')}`));
        console.log('');
      }
    }
  }

  // --suggest: fuzzy-match each missing var against documented (.env.example)
  // names so a typo/rename shows up as "did you mean X?" instead of a dead
  // end. Re-reads .env.example so this reflects any --fix additions above.
  if (options.suggest && diffResult.missing.length > 0) {
    const currentExampleVars = [...parseEnvFile(examplePath)];
    for (const item of diffResult.missing) {
      item.suggestion = findClosestMatch(item.name, currentExampleVars);
    }
  }

  // --validate-format: check .env values against the config's `validate` schema
  let invalidFormat = [];
  if (options.validateFormat) {
    invalidFormat = validateEnvFormats(targetDir, config.validate);
  }

  // Secret-leak detection across all real .env* files (never .env.example)
  let secrets = [];
  let gitignoreOk = null;
  if (config.secretDetection && options.secrets !== false) {
    const seen = new Set();
    for (const fileName of ENV_FILE_NAMES) {
      const fullPath = path.join(targetDir, fileName);
      for (const finding of detectSecretLeaks(fullPath)) {
        const key = `${finding.name}:${finding.reason}`;
        if (!seen.has(key)) {
          seen.add(key);
          secrets.push(finding);
        }
      }
    }
    if (filesFound.includes('.env')) {
      gitignoreOk = isEnvGitIgnored(targetDir);
    }
  }

  // --stats: health score is always computed when requested, from the
  // same numbers already gathered above — no extra scanning.
  let healthScore = null;
  if (options.stats) {
    healthScore = calculateHealthScore({
      missingCount: diffResult.missing.length + diffResult.requiredMissing.length,
      undocumentedCount: diffResult.undocumented.length,
      unusedCount: diffResult.unused.length,
      gitignoreOk,
      secretsCount: secrets.length,
      hasExampleFile,
    });
  }

  const meta = { filesScanned, timeMs, dir: targetDir };
  const reportOptions = {
    ignoreUnused: config.ignoreUnused, secrets, gitignoreOk, strict: options.strict,
    invalidFormat, healthScore,
  };

  // --report html: written after the score is available (so the report
  // can embed it), before printing, so its path can appear in --json too.
  let reportPath = null;
  if (options.report) {
    if (options.report !== 'html') {
      const message = `Unsupported --report format "${options.report}" — supported: html`;
      if (jsonMode) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.log(chalk.red.bold(`✖ ${message}`));
      }
      process.exitCode = 1;
      return;
    }

    const scoreForReport = healthScore || calculateHealthScore({
      missingCount: diffResult.missing.length + diffResult.requiredMissing.length,
      undocumentedCount: diffResult.undocumented.length,
      unusedCount: diffResult.unused.length,
      gitignoreOk,
      secretsCount: secrets.length,
      hasExampleFile,
    });

    reportPath = generateHtmlReport({
      dir: targetDir,
      diffResult,
      invalidFormat,
      secrets,
      gitignoreOk,
      healthScore: scoreForReport,
      meta,
      outputPath: path.join(targetDir, 'envscan-report.html'),
    });

    if (!jsonMode) {
      console.log(chalk.green.bold(`✔ Report written to ${path.relative(targetDir, reportPath)}`));
    }
  }

  if (jsonMode) {
    printJsonReport(diffResult, meta, { ...reportOptions, reportPath });
  } else {
    printReport(diffResult, meta, reportOptions);
  }

  const { exitCode } = evaluateFailure(diffResult, { strict: options.strict, ignoreUnused: config.ignoreUnused, invalidFormat });
  if (exitCode !== 0 && !options.watch) {
    process.exitCode = exitCode;
  }
}

function printBanner(version) {
  const banner = boxen(`envscan-cli v${version}\nAudit your .env`, {
    padding: 1,
    borderColor: 'cyan',
    borderStyle: 'round',
  });
  console.log(chalk.cyan(banner));
}
