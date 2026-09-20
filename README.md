# envscan-cli

[![CI](https://github.com/Innocent-Developer/envscan-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/Innocent-Developer/envscan-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/envscan-cli.svg)](https://www.npmjs.com/package/envscan-cli)
[![License: MIT](https://img.shields.io/npm/l/envscan-cli.svg)](./LICENSE)

> Audit your environment variables before they break production.

## The Problem

Environment variables rot silently. A teammate adds `process.env.STRIPE_KEY` in a new module but forgets to add it to `.env` or `.env.example`, and it doesn't surface until a deploy fails. Old keys linger in `.env` long after the code that used them is gone. Real secrets end up sitting in a `.env` that was never actually gitignored. `envscan-cli` scans your codebase and your `.env` files and tells you exactly where they've drifted apart — and catches the security footguns along the way.

## What It Catches

- ✖ **Missing** — referenced in code via `process.env.X`, but not defined in any `.env` file
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

## Auto-Fix

```bash
npx envscan-cli --fix
```

Appends placeholder entries (`VAR_NAME=`) to `.env.example` for anything undocumented or missing, then re-runs the diff so the report reflects the fix. **Never touches your real `.env`** — only the committed example file, which should never hold real values.

## JSON Output

```bash
npx envscan-cli --json > report.json
```

Emits a single JSON object (`missing`, `undocumented`, `unused`, `secrets`, `gitignoreProtectsEnv`, `strict`, `failReasons`, `meta`) with no ANSI codes or banner — safe to pipe into other tooling, dashboards, or a CI annotation step.

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
