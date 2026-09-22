# envscan-cli

[![CI](https://github.com/Innocent-Developer/envscan-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/Innocent-Developer/envscan-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/envscan-cli.svg)](https://www.npmjs.com/package/envscan-cli)
[![License: MIT](https://img.shields.io/npm/l/envscan-cli.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/website-envscan--cli.abubakkar.dev-blue)](https://envscan-cli.abubakkar.dev/)

> Audit your environment variables before they break production.

**🔗 Live site: [envscan-cli.abubakkar.dev](https://envscan-cli.abubakkar.dev/)** — usage examples, every flag, and live npm/GitHub stats.

## The Problem

Environment variables rot silently. A teammate adds `process.env.STRIPE_KEY` in a new module but forgets to add it to `.env` or `.env.example`, and it doesn't surface until a deploy fails. Old keys linger in `.env` long after the code that used them is gone. Real secrets end up sitting in a `.env` that was never actually gitignored. `envscan-cli` scans your codebase and your `.env` files and tells you exactly where they've drifted apart — and catches the security footguns along the way.

## What It Catches

- 🔴 **Required + missing** — variables you've explicitly marked `required` in config; always fails the build, even if `ignore`d
- ✖ **Missing** — referenced in code via `process.env.X`, but not defined in any `.env` file
- ✖ **Invalid format** — a `.env` value that doesn't match the type you declared for it (number, url, boolean, email)
- ⚠ **Undocumented** — defined in `.env`, but missing from `.env.example` (so new contributors won't know it exists)
- ○ **Unused** — defined in `.env`, but never referenced anywhere in code
- 🔒 **Potential secret leaks** — real-looking credential values sitting in `.env` (known formats + high-entropy heuristics)
- 🔓 **Gitignore hygiene** — warns if `.env` isn't actually covered by `.gitignore`

## Install & Run

No install required — run it directly against any project:

```bash
npx envscan-cli
```

Or install it as a dev dependency:

```bash
npm install --save-dev envscan-cli
```

```bash
npx envscan-cli --dir ./backend
```

## Options

| Flag | Description |
|---|---|
| `-d, --dir <path>` | Directory to scan (default: current working directory) |
| `-e, --example <path>` | Custom path to your `.env.example` file |
| `-c, --config <path>` | Path to a specific config file (overrides auto-detection) |
| `--ignore-unused` | Suppress unused variable warnings |
| `--no-banner` | Hide the startup banner |
| `--fix` | Auto-fix: add missing/undocumented vars into `.env.example` as placeholders |
| `--json` | Output a machine-readable JSON report instead of the CLI report |
| `--no-secrets` | Disable secret-leak detection for this run |
| `-w, --watch` | Watch the project and re-run automatically on every change |
| `--strict` | Fail the build on undocumented and unused vars too, not just missing |
| `--suggest` | Suggest the closest `.env.example` name for each missing var (typo detection) |
| `--validate-format` | Validate `.env` values against the `validate` schema in your config file |
| `--compare <fileA> <fileB>` | Compare two `.env` files instead of running the normal audit |
| `--stats` | Show a 0-100 environment-hygiene health score |
| `--report <format>` | Generate a shareable report file (supported: `html`) |
| `--init` | Run the interactive setup wizard to generate `.env.example` and a config file |
| `-v, --version` | Show the installed version |
| `-h, --help` | Show help and usage examples |

## Config File

Drop an `envscan-cli.config.js` (or `.envscan-clirc.json`) in your project root and envscan-cli picks it up automatically — no flags required. CLI flags always override the config file.

```js
// envscan-cli.config.js
export default {
  // Variable names/patterns to exclude from every check.
  // Trailing wildcard supported: "LEGACY_*" matches LEGACY_TOKEN, LEGACY_URL, ...
  ignore: ['LEGACY_*', 'DEBUG'],

  // Path to your .env.example file, relative to the scanned directory.
  exampleFile: '.env.example',

  // Same as passing --ignore-unused on every run.
  ignoreUnused: false,

  // Scan real .env values for things that look like live credentials.
  secretDetection: true,
};
```

A ready-to-copy version ships at `envscan-cli.config.example.js`.

## `.envscanignore`

A `.gitignore`-style file for globally ignored variable names, no config file required:

```
# .envscanignore
DEBUG
LEGACY_*
```

One name or wildcard pattern per line, `#` comments allowed. Patterns here are merged with the `ignore` array from your config file (if you have one) — use whichever is more convenient, or both. A ready-to-copy version ships at `envscanignore.example`.

## Strict Mode

```bash
npx envscan-cli --strict
```

By default only **missing** variables fail the build (exit code `1`) — undocumented and unused vars are reported but treated as advisory. `--strict` raises the bar: the build also fails if any variable is undocumented or unused, even when nothing is missing. Combine with `--ignore-unused` to keep strict enforcement on missing/undocumented while still treating unused vars as advisory.

## Typo Suggestions

```bash
npx envscan-cli --suggest
```

For each missing variable, fuzzy-matches its name against everything in `.env.example` and — if something is close enough to plausibly be the same variable — prints a suggestion:

```
✖ MISSING (1) — used in code but not in any .env file
───────────────────────────────────────────────────────
❯ DATABASE_URL
    src/db.js:4
    💡 Did you mean DB_URL instead of DATABASE_URL?
```

This is a heuristic (edit-distance based), not a guarantee — it catches renames and typos, not every case, and can occasionally suggest a name that isn't actually related.

## Required Variables

In your config file:

```js
export default {
  required: ['DATABASE_URL', 'JWT_SECRET', 'PORT'],
};
```

Any variable listed here is checked directly against your `.env` files — independent of whether it's referenced in code, and independent of any `ignore` pattern that would otherwise suppress it. If it's absent, it's reported in its own section and **always** fails the build (exit code `1`), no matter what other flags are set:

```
🔴 REQUIRED + MISSING (1)
────────────────────────────
❯ DATABASE_URL (marked required in config)
    src/db.js:3
```

## Format Validation

In your config file:

```js
export default {
  validate: {
    PORT: 'number',
    APP_URL: 'url',
    DEBUG: 'boolean',
    ADMIN_EMAIL: 'email',
  },
};
```

Then run:

```bash
npx envscan-cli --validate-format
```

Reads the actual values from your `.env` and checks them against the declared type (`string`, `number`, `boolean`, `url`, `email`):

```
✖ INVALID FORMAT (2)
────────────────────────────────
❯ PORT → expected number, got "abc"
❯ APP_URL → expected valid URL, got "localhost"
```

A variable only gets checked if it's both declared in `validate` and actually present with a value — an absent variable is the MISSING check's job, not this one's. Invalid formats exit with code **`2`**, kept separate from missing vars' exit code `1` — unless something is also missing, in which case exit `1` takes priority (a fully broken config beats a badly-typed one).

## Comparing Environments

```bash
npx envscan-cli --compare .env.staging .env.production
```

A standalone mode — runs instead of the normal audit, not alongside it. Reads both files and reports what's only in one, and what's present in both but holds a different value:

```
In .env.staging but not .env.production (1)
❯ DEBUG

In .env.production but not .env.staging (1)
❯ STRIPE_KEY

Present in both, different value (2)
❯ DB_URL  .env.staging="postgres://staging"  .env.production="postgres://prod"
❯ PORT  .env.staging="3000"  .env.production="8080"

────────────────────────────────
0 match  ·  2 differ  ·  2 missing
```

Useful as a pre-deploy sanity check — confirm staging and production haven't drifted apart before promoting a release. File paths are resolved relative to `--dir`.

## Health Score

```bash
npx envscan-cli --stats
```

Rolls the audit results into a single 0-100 score:

```
┌─────────────────────────┐
│  Env Health Score: 73   │
│  ████████░░  Good       │
└─────────────────────────┘
```

Starts at 100 and deducts: up to 40 points for missing/required-missing vars (-10 each), up to 20 for undocumented (-5 each), up to 10 for unused (-2 each), 15 if `.env` isn't gitignored, 20 if any secret leak is detected, and 5 if no `.env.example` exists at all. 90-100 is Excellent, 70-89 Good, 50-69 Fair, below 50 Critical. With `--json`, the score is included as a `healthScore` field instead of the boxed display.

## Interactive Setup Wizard

```bash
npx envscan-cli --init
```

For a project with no `.env.example` yet. Scans your codebase for every `process.env.X` reference, then walks you through each one: whether to document it, what type it is (`string`/`number`/`boolean`/`url`/`email`), and an optional description — then writes a fully commented `.env.example`:

```
# Server port number
# Type: number
PORT=
```

Finishes by offering to scaffold `envscan-cli.config.js` with a `validate` schema pre-filled from the types you just chose. Requires an interactive terminal — it won't run inside a plain piped/non-TTY shell.

`--init` also requires **Node.js >=20.17** (or `^22.13`/`>=23.5`) — its underlying prompt library, `@inquirer/prompts`, doesn't support Node 18. Every other envscan-cli command works fine on Node 18+; only `--init` is affected, and it fails with a clear message rather than a crash if you're on an unsupported version.

## HTML Reports

```bash
npx envscan-cli --report html
```

Writes a single self-contained `envscan-report.html` — no external assets, no network calls, safe to open offline or attach to a PR/ticket. Includes the health-score gauge, every finding color-coded by severity, and clickable `vscode://` deep links straight to each `file:line` reference (opens in VS Code if it's your OS handler for that URI scheme).

## Pre-commit Hook

```bash
npx envscan-cli install-hook
```

Installs a git hook at `.git/hooks/pre-commit` that runs `envscan-cli --no-banner --ignore-unused` before every commit and blocks it if any variable is missing. If a pre-commit hook already exists and wasn't installed by envscan-cli, it's backed up first rather than overwritten.

```bash
npx envscan-cli uninstall-hook
```

Removes the hook — and restores your previous one automatically if a backup exists. Refuses to touch a hook it didn't install itself.

## Auto-Fix

```bash
npx envscan-cli --fix
```

Appends placeholder entries (`VAR_NAME=`) to `.env.example` for anything undocumented or missing, then re-runs the diff so the report reflects the fix. **Never touches your real `.env`** — only the committed example file, which should never hold real values.

## JSON Output

```bash
npx envscan-cli --json > report.json
```

Emits a single JSON object (`requiredMissing`, `missing`, `invalidFormat`, `undocumented`, `unused`, `secrets`, `gitignoreProtectsEnv`, `strict`, `exitCode`, `failReasons`, `meta`, plus `healthScore` and `reportPath` when `--stats`/`--report` are used) with no ANSI codes or banner — safe to pipe into other tooling, dashboards, or a CI annotation step. `--compare` produces a differently-shaped JSON object (`compare`, `summary`) since it's a standalone mode rather than part of the normal audit.

## CI/CD Usage

`envscan-cli` exits with code `1` whenever any **missing** variables are found, making it a natural pre-deploy gate. Undocumented, unused, and secret findings are reported but do not fail the build by default — add `--strict` if you want undocumented/unused vars to fail CI too.

Generate a ready-to-commit GitHub Actions workflow automatically:

```bash
npx envscan-cli init-ci
```

This writes `.github/workflows/envscan-cli.yml`:

```yaml
name: envscan-cli

on:
  pull_request:
  push:
    branches: [main]

jobs:
  audit-env:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Audit environment variables
        run: npx envscan-cli --dir . --ignore-unused
```

Or wire it in by hand:

```yaml
- name: Audit environment variables
  run: npx envscan-cli --dir . --ignore-unused
```

If a required variable is missing, the job fails before your app ever reaches a broken deployment.

## Releases & Provenance

Published releases go out through a dedicated GitHub Actions workflow (`.github/workflows/release.yml`), triggered only when a maintainer publishes a GitHub Release — never automatically on a normal push to `main`.

Publishing uses **npm Trusted Publishing (OIDC)**: the workflow authenticates to npm using a short-lived GitHub-issued token instead of a stored npm access token, and npm automatically attaches **provenance attestations** — a cryptographically verifiable, public record tying the published package to the exact GitHub Actions run, commit, and workflow that built it. You can inspect this on any given version's page at npmjs.com under the "Provenance" tab.

## Watch Mode

```bash
npx envscan-cli --watch
```

Re-runs the full audit automatically whenever a source file or `.env` file changes — useful while actively wiring up a new integration.

## Secret-Leak Detection

Every real `.env`/`.env.local`/`.env.development`/`.env.production` file (never `.env.example`) is scanned for:

- Known credential formats (AWS access keys, Stripe live keys, GitHub tokens, Slack tokens, Google API keys, PEM private key blocks, JWTs)
- High-entropy values on suspiciously named variables (`*SECRET*`, `*KEY*`, `*TOKEN*`, `*PASSWORD*`, etc.)

Only the variable **name** and the matched reason are ever printed — never the value. envscan-cli also checks whether `.env` is actually covered by your `.gitignore` and warns if it isn't. Disable this pass with `--no-secrets` or `secretDetection: false` in your config.

## Example Output

```
✖ MISSING (2) — used in code but not in any .env file
───────────────────────────────────────────────────────
❯ JWT_SECRET
    src/auth.js:12
❯ STRIPE_KEY
    src/payments.js:8

⚠ UNDOCUMENTED (1) — in .env but not in .env.example
───────────────────────────────────────────────────────
❯ APP_NAME

○ UNUSED (1) — defined in .env but never used in code
───────────────────────────────────────────────────────
❯ OLD_TOKEN

───────────────────────────────────────────────────────
2 missing  ·  1 undocumented  ·  1 unused
Scanned 3 files in 0.1s
───────────────────────────────────────────────────────
```

## Contributing

Issues and pull requests are welcome. If you're proposing a larger change, please open an issue first to discuss the approach.

## License

MIT — Abubakkar Sajid

---

🔗 [envscan-cli.abubakkar.dev](https://envscan-cli.abubakkar.dev/) · [npm](https://www.npmjs.com/package/envscan-cli) · [GitHub Releases](https://github.com/Innocent-Developer/envscan-cli/releases)
