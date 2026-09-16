import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_TEMPLATE = `name: envscan-cli

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
`;

/**
 * Writes a ready-to-use GitHub Actions workflow that runs envscan-cli
 * on every push/PR and fails the build if required vars are missing.
 *
 * @param {string} dir - project root
 * @returns {{ filePath: string, created: boolean }} created=false if the file already existed and was not overwritten
 */
export function generateGitHubAction(dir) {
  const workflowDir = path.join(dir, '.github', 'workflows');
  const filePath = path.join(workflowDir, 'envscan-cli.yml');

  if (fs.existsSync(filePath)) {
    return { filePath, created: false };
  }

  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(filePath, WORKFLOW_TEMPLATE, 'utf8');

  return { filePath, created: true };
}
