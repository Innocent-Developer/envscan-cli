import fs from 'node:fs';
import path from 'node:path';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Parses a "relative/path/to/file.js:12" location string into an
 * absolute-path vscode:// deep link, so clicking it in the HTML report
 * opens the exact line in VS Code (when VS Code is the OS handler for
 * that URI scheme).
 *
 * @param {string} location - "relative/path:line"
 * @param {string} dir - project root the location is relative to
 * @returns {{ display: string, href: string }}
 */
function locationToLink(location, dir) {
  const lastColon = location.lastIndexOf(':');
  const relPath = lastColon === -1 ? location : location.slice(0, lastColon);
  const line = lastColon === -1 ? '' : location.slice(lastColon + 1);
  const absPath = path.resolve(dir, relPath);
  const href = `vscode://file/${absPath}${line ? ':' + line : ''}`;
  return { display: location, href };
}

function renderFindingSection(title, colorClass, icon, items, dir, renderItem) {
  if (!items || items.length === 0) return '';
  const rows = items.map(renderItem).join('\n');
  return `
    <section class="finding ${colorClass}">
      <h2>${icon} ${escapeHtml(title)} (${items.length})</h2>
      <ul class="finding-list">
        ${rows}
      </ul>
    </section>`;
}

/**
 * Generates a single self-contained HTML file summarizing the full
 * audit — findings, health score, and clickable file:line references —
 * meant to be opened locally or shared with a teammate/CI artifact.
 * No external assets, no JavaScript, no network requests.
 *
 * @param {object} params
 * @param {string} params.dir - project root that was scanned
 * @param {ReturnType<typeof import('./diff.js').diffEnvVars>} params.diffResult
 * @param {{ name: string, expectedType: string, gotValue: string }[]} [params.invalidFormat]
 * @param {{ name: string, reason: string }[]} [params.secrets]
 * @param {boolean|null} [params.gitignoreOk]
 * @param {{ score: number, grade: string, bar: string }} params.healthScore
 * @param {{ filesScanned: number, timeMs: number }} params.meta
 * @param {string} params.outputPath - absolute path to write the report to
 * @returns {string} the path the report was written to
 */
export function generateHtmlReport({
  dir,
  diffResult,
  invalidFormat = [],
  secrets = [],
  gitignoreOk = null,
  healthScore,
  meta,
  outputPath,
}) {
  const projectName = path.basename(dir);
  const timestamp = new Date().toISOString();
  const { missing, undocumented, unused, requiredMissing } = diffResult;

  const gradeColor = { Excellent: '#4ade80', Good: '#a3e635', Fair: '#facc15', Critical: '#f87171' }[healthScore.grade] || '#94a3b8';

  const requiredSection = renderFindingSection(
    'REQUIRED + MISSING', 'critical', '🔴', requiredMissing, dir,
    (item) => `<li><span class="var-name">${escapeHtml(item.name)}</span>${
      item.locations.length
        ? item.locations.map((loc) => { const { display, href } = locationToLink(loc, dir); return `<a class="loc" href="${escapeHtml(href)}">${escapeHtml(display)}</a>`; }).join('')
        : '<span class="loc muted">(not referenced in code)</span>'
    }</li>`
  );

  const missingSection = renderFindingSection(
    'MISSING', 'error', '✖', missing, dir,
    (item) => `<li><span class="var-name">${escapeHtml(item.name)}</span>${item.locations.map((loc) => { const { display, href } = locationToLink(loc, dir); return `<a class="loc" href="${escapeHtml(href)}">${escapeHtml(display)}</a>`; }).join('')}</li>`
  );

  const invalidSection = renderFindingSection(
    'INVALID FORMAT', 'error', '✖', invalidFormat, dir,
    (item) => `<li><span class="var-name">${escapeHtml(item.name)}</span><span class="loc">expected ${escapeHtml(item.expectedType)}, got "${escapeHtml(item.gotValue)}"</span></li>`
  );

  const undocumentedSection = renderFindingSection(
    'UNDOCUMENTED', 'warning', '⚠', undocumented, dir,
    (item) => `<li><span class="var-name">${escapeHtml(item.name)}</span></li>`
  );

  const unusedSection = renderFindingSection(
    'UNUSED', 'muted-section', '○', unused, dir,
    (item) => `<li><span class="var-name">${escapeHtml(item.name)}</span></li>`
  );

  const secretsSection = renderFindingSection(
    'POTENTIAL SECRET LEAK', 'critical', '🔒', secrets, dir,
    (item) => `<li><span class="var-name">${escapeHtml(item.name)}</span><span class="loc">${escapeHtml(item.reason)}</span></li>`
  );

  const gitignoreWarning = gitignoreOk === false
    ? `<section class="finding critical"><h2>🔓 GITIGNORE HYGIENE</h2><p>.env is not covered by .gitignore — it can be committed by accident.</p></section>`
    : '';

  const allClean = missing.length === 0 && undocumented.length === 0 && unused.length === 0
    && requiredMissing.length === 0 && invalidFormat.length === 0 && secrets.length === 0 && gitignoreOk !== false;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>envscan-cli report — ${escapeHtml(projectName)}</title>
<style>
  :root {
    --bg: #0f1117; --panel: #171a23; --border: #262b38; --text: #e2e5ec; --muted: #8b93a7;
    --error: #f87171; --warning: #facc15; --ok: #4ade80;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.5rem; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  .container { max-width: 860px; margin: 0 auto; }
  header { margin-bottom: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .meta { color: var(--muted); font-size: 0.875rem; }
  .score-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 1.5rem; margin-bottom: 2rem; display: flex; align-items: center; gap: 1.5rem;
  }
  .score-number { font-size: 2.5rem; font-weight: 700; color: ${gradeColor}; }
  .score-bar { font-family: monospace; font-size: 1.1rem; letter-spacing: 1px; color: ${gradeColor}; }
  .score-grade { font-weight: 600; color: ${gradeColor}; }
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  .summary-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
  .summary-table td:last-child { text-align: right; font-weight: 600; }
  section.finding {
    background: var(--panel); border: 1px solid var(--border); border-left-width: 4px;
    border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem;
  }
  section.finding.error { border-left-color: var(--error); }
  section.finding.critical { border-left-color: var(--error); }
  section.finding.warning { border-left-color: var(--warning); }
  section.finding.muted-section { border-left-color: var(--muted); }
  section.finding h2 { font-size: 1rem; margin: 0 0 0.75rem; }
  .finding-list { list-style: none; margin: 0; padding: 0; }
  .finding-list li { padding: 0.4rem 0; border-top: 1px solid var(--border); }
  .finding-list li:first-child { border-top: none; }
  .var-name { font-family: monospace; font-weight: 600; margin-right: 0.75rem; }
  .loc { display: inline-block; font-size: 0.8rem; color: var(--muted); margin-right: 0.75rem; text-decoration: none; }
  .loc:hover { color: var(--text); text-decoration: underline; }
  .loc.muted { text-decoration: none; }
  .all-clean { text-align: center; padding: 3rem 1rem; color: var(--ok); font-size: 1.1rem; }
  footer { margin-top: 2rem; color: var(--muted); font-size: 0.8rem; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>envscan-cli report — ${escapeHtml(projectName)}</h1>
    <div class="meta">Generated ${escapeHtml(timestamp)} · Scanned ${meta.filesScanned} files in ${(meta.timeMs / 1000).toFixed(1)}s</div>
  </header>

  <div class="score-card">
    <div class="score-number">${healthScore.score}</div>
    <div>
      <div class="score-bar">${escapeHtml(healthScore.bar)}</div>
      <div class="score-grade">${escapeHtml(healthScore.grade)}</div>
    </div>
  </div>

  <table class="summary-table">
    <tr><td>Required + missing</td><td>${requiredMissing.length}</td></tr>
    <tr><td>Missing</td><td>${missing.length}</td></tr>
    <tr><td>Invalid format</td><td>${invalidFormat.length}</td></tr>
    <tr><td>Undocumented</td><td>${undocumented.length}</td></tr>
    <tr><td>Unused</td><td>${unused.length}</td></tr>
    <tr><td>Potential secret leaks</td><td>${secrets.length}</td></tr>
  </table>

  ${allClean ? '<div class="all-clean">✔ All environment variables are accounted for.</div>' : ''}
  ${requiredSection}${missingSection}${invalidSection}${undocumentedSection}${unusedSection}${secretsSection}${gitignoreWarning}

  <footer>Generated by envscan-cli</footer>
</div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}
