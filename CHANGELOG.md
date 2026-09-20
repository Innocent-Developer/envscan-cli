# Changelog

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
