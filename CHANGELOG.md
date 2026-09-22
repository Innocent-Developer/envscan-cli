# Changelog

## 2.0.5

Seven new features, all additive — existing behavior and output are unchanged (verified against the baseline demo before and after).

- **`required` config + 🔴 REQUIRED + MISSING** — vars marked `required` in config are checked independent of code usage and `ignore` patterns, and always fail the build if absent.
- **`--validate-format`** — validates `.env` values against a `validate: { NAME: type }` schema in config (`string`/`number`/`boolean`/`url`/`email`). Exits with code `2`, distinct from missing vars' exit code `1` (missing takes priority if both occur).
- **`--compare <fileA> <fileB>`** — standalone mode comparing two `.env` files: only-in-A, only-in-B, and differing values.
- **`--stats`** — 0-100 environment-hygiene health score with a boxed gauge; included as `healthScore` in `--json` output.
- **`--init`** — interactive setup wizard (`@inquirer/prompts`) that scans for `process.env` usage and walks through generating a commented `.env.example` plus an optional config file.
- **`--report html`** — single self-contained `envscan-report.html` with a health-score gauge, color-coded findings, and clickable `vscode://` file:line links.
- **`install-hook` / `uninstall-hook`** — pre-commit git hook that blocks commits with missing env vars; backs up and restores any pre-existing foreign hook rather than overwriting it.
- New dependency: `@inquirer/prompts`.

## 2.0.4

Docs/metadata only — no CLI functionality changes.

- Adds the live documentation site, [envscan-cli.abubakkar.dev](https://envscan-cli.abubakkar.dev/), to the README (badge + inline link) and to `package.json`'s `homepage` field (previously pointed at the GitHub README).
- `.gitignore` fix from the 2.0.3 patch (tracking `test-project/.env`) is included/carried forward.

## 2.0.3

Release engineering — no CLI functionality changes.

- Adds `.github/workflows/ci.yml`: runs on every PR and push to `main` across Node 18/20/22, using only the project's existing npm scripts (no invented `test`/`build`/`lint` commands) plus a packaging sanity check (`npm pack --dry-run`) and a regression check against the bundled `test-project` fixture.
- Adds `.github/workflows/release.yml`: publishes to npm only when a GitHub Release is published (tag-based, never on a normal push), using npm Trusted Publishing (OIDC) — no stored `NPM_TOKEN`. Provenance attestations are attached automatically by npm.
- Adds `repository`, `homepage`, and `bugs` fields to `package.json`.
- Adds CI/npm version/license badges and a "Releases & Provenance" section to the README.
- **Requires manual, one-time setup on npmjs.com** to actually take effect — see the release notes / PR description for exact steps; this repository change alone does not enable Trusted Publishing.

## 2.0.2

- `--strict` — fails the build (exit code 1) on undocumented and unused vars too, not just missing
- `--suggest` — fuzzy-matches each missing var against `.env.example` and suggests the closest name ("Did you mean DB_URL instead of DATABASE_URL?")
- `.envscanignore` — a `.gitignore`-style file for globally ignored variable names/patterns, merged with the config file's `ignore` array

## 2.0.1

**Fixes a broken published release.** `2.0.0`'s npm tarball did not actually
contain the v2 source — running `npx envscan-cli` was still executing old
`env-doctor`-era code (no `--fix`, `--json`, `--watch`, or `init-ci`, and a
banner still reading `env-doctor v1.0.1`). This release republishes the
correct, verified v2 codebase under the `envscan-cli` name.

No functional changes from the intended `2.0.0` feature set — see below.

## 2.0.0

- `--fix` — auto-fix mode, appends missing/undocumented vars to `.env.example`
- `--json` — machine-readable JSON report for CI/tooling
- `-w, --watch` — re-run automatically on file changes
- `init-ci` — generates a ready-to-commit GitHub Actions workflow
- `envscan-cli.config.js` / `.envscan-clirc.json` — config file with `ignore` patterns
- Secret-leak detection (`--no-secrets` to disable) + `.gitignore` hygiene check for `.env`

## 1.0.0

- Initial release: MISSING / UNDOCUMENTED / UNUSED detection via AST scan of `process.env.*`
