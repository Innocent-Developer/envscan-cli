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
import { printReport } from '../src/reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('env-doctor')
  .description('Audit environment variables in a Node.js project')
  .version(pkg.version, '-v, --version', 'Show version')
  .option('-d, --dir <path>', 'Directory to scan', process.cwd())
  .option('-e, --example <path>', '.env.example path')
  .option('--ignore-unused', 'Suppress unused warnings', false)
  .option('--no-banner', 'Hide banner')
  .addHelpText(
    'after',
    `
Examples:
  $ npx env-doctor
  $ npx env-doctor --dir ./backend
  $ npx env-doctor --dir ./app --example .env.example.ci
`
  );

program.parse(process.argv);

const options = program.opts();

await main(options);

async function main(options) {
  const targetDir = path.resolve(options.dir);

  if (options.banner) {
    printBanner(pkg.version);
  }

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.log(chalk.red.bold(`✖ Error: Directory not found → "${options.dir}"`));
    process.exit(1);
  }

  console.log(chalk.dim(`Scanning: ${targetDir}`));

  const spinner = ora('Scanning your codebase...').start();
  const startTime = Date.now();

  let codeVars;
  let filesScanned;

  try {
    const scanResult = await scanCodebase(targetDir);
    codeVars = scanResult.codeVars;
    filesScanned = scanResult.filesScanned;
  } catch (err) {
    spinner.fail('Scan failed.');
    console.log(chalk.red.bold(`✖ Error: ${err.message}`));
    process.exit(1);
    return;
  }

  const { vars: envVars, filesFound } = parseAllEnvFiles(targetDir);

  const examplePath = options.example
    ? path.resolve(options.example)
    : path.join(targetDir, '.env.example');
  const exampleVars = parseEnvFile(examplePath);

  const timeMs = Date.now() - startTime;
  spinner.stop();

  if (filesScanned === 0) {
    console.log(chalk.yellow.bold('⚠ No JavaScript or TypeScript files found.'));
  }

  if (filesFound.length === 0) {
    console.log(chalk.yellow.bold('⚠ No .env file found. Checking code references only.'));
  }

  const diffResult = diffEnvVars({ codeVars, envVars, exampleVars });

  printReport(diffResult, { filesScanned, timeMs, dir: targetDir }, {
    ignoreUnused: options.ignoreUnused,
  });

  if (diffResult.missing.length > 0) {
    process.exit(1);
  }
}

function printBanner(version) {
  const banner = boxen(`env-doctor v${version}\nAudit your .env`, {
    padding: 1,
    borderColor: 'cyan',
    borderStyle: 'round',
  });
  console.log(chalk.cyan(banner));
}
