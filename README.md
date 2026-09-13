# envscan-cli

> Audit your environment variables before they break production.

## The Problem

Environment variables rot silently. A teammate adds `process.env.STRIPE_KEY` in a new module but forgets to add it to `.env` or `.env.example`, and it doesn't surface until a deploy fails. Old keys linger in `.env` long after the code that used them is gone. `envscan-cli` scans your codebase and your `.env` files and tells you exactly where they've drifted apart.

## What It Catches

- ✖ **Missing** — referenced in code via `process.env.X`, but not defined in any `.env` file
- ⚠ **Undocumented** — defined in `.env`, but missing from `.env.example` (so new contributors won't know it exists)
- ○ **Unused** — defined in `.env`, but never referenced anywhere in code

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
| `--ignore-unused` | Suppress unused variable warnings |
| `--no-banner` | Hide the startup banner |
| `-v, --version` | Show the installed version |
| `-h, --help` | Show help and usage examples |

## CI/CD Usage

`envscan-cli` exits with code `1` whenever any **missing** variables are found, making it a natural pre-deploy gate. Undocumented and unused variables are reported but do not fail the build.

Example GitHub Actions step:

```yaml
- name: Audit environment variables
  run: npx envscan-cli --dir . --ignore-unused
```

If a required variable is missing, the job fails before your app ever reaches a broken deployment.

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
