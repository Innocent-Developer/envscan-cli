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
import { printReport, printJsonReport } from '../src/reporter.js';
import { loadConfig } from '../src/config.js';
import { autoFixExampleFile } from '../src/fixer.js';
import { generateGitHubAction } from '../src/ci.js';
import { startWatch } from '../src/watch.js';
import { detectSecretLeaks, isEnvGitIgnored } from '../src/secrets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

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
  $ npx envscan-cli init-ci
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

// Root command needs its own explicit action: Commander only treats
// invocation-with-no-subcommand as "run the root" when one is registered
// here — otherwise, since init-ci exists as a subcommand, it falls back
// to printing help.
program.action(async (cmdOptions) => {
  await main(cmdOptions);
});

await program.parseAsync(process.argv);

async function main(options) {
  const targetDir = path.resolve(options.dir);
  const jsonMode = Boolean(options.json);

  if (options.banner && !jsonMode) {
    printBanner(pkg.version);
  }

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    if (jsonMode) {
      console.log(JSON.stringify({ error: `Directory not found: ${options.dir}` }, null, 2));
    } else {
      console.log(chalk.red.bold(`✖ Error: Directory not found → "${options.dir}"`));
    }
    process.exit(1);
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

  const timeMs = Date.now() - startTime;
  if (spinner) spinner.stop();

  if (!jsonMode && filesScanned === 0) {
    console.log(chalk.yellow.bold('⚠ No JavaScript or TypeScript files found.'));
  }

  if (!jsonMode && filesFound.length === 0) {
    console.log(chalk.yellow.bold('⚠ No .env file found. Checking code references only.'));
  }

  const diffResult = diffEnvVars({ codeVars, envVars, exampleVars, ignore: config.ignore });

  // --fix: write missing/undocumented vars into .env.example before reporting
  if (options.fix) {
    const { added } = autoFixExampleFile(examplePath, diffResult);
    if (added.length > 0) {
      const refreshedExampleVars = parseEnvFile(examplePath);
      const refreshedDiff = diffEnvVars({ codeVars, envVars, exampleVars: refreshedExampleVars, ignore: config.ignore });
      Object.assign(diffResult, refreshedDiff);
      if (!jsonMode) {
        console.log(chalk.green.bold(`✔ --fix: added ${added.length} variable(s) to ${path.relative(targetDir, examplePath)}`));
        console.log(chalk.dim(`    ${added.join(', ')}`));
        console.log('');
      }
    }
  }

  // Secret-leak detection across all real .env* files (never .env.example)
  let secrets = [];
  let gitignoreOk = null;
  if (config.secretDetection && options.secrets !== false) {
    const envFileNames = ['.env', '.env.local', '.env.development', '.env.production'];
    const seen = new Set();
    for (const fileName of envFileNames) {
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

  const meta = { filesScanned, timeMs, dir: targetDir };

  if (jsonMode) {
    printJsonReport(diffResult, meta, { secrets, gitignoreOk });
  } else {
    printReport(diffResult, meta, { ignoreUnused: config.ignoreUnused, secrets, gitignoreOk });
  }

  if (diffResult.missing.length > 0 && !options.watch) {
    process.exitCode = 1;
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
