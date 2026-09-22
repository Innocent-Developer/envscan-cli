const GRADES = [
  { min: 90, label: 'Excellent' },
  { min: 70, label: 'Good' },
  { min: 50, label: 'Fair' },
  { min: 0, label: 'Critical' },
];

/**
 * Calculates a 0-100 environment-hygiene health score from the audit
 * results. Purely derived from counts already computed elsewhere —
 * this never re-scans anything itself.
 *
 * @param {{
 *   missingCount: number,
 *   undocumentedCount: number,
 *   unusedCount: number,
 *   gitignoreOk: boolean|null,
 *   secretsCount: number,
 *   hasExampleFile: boolean,
 * }} inputs
 * @returns {{ score: number, grade: string, bar: string }}
 */
export function calculateHealthScore({
  missingCount = 0,
  undocumentedCount = 0,
  unusedCount = 0,
  gitignoreOk = null,
  secretsCount = 0,
  hasExampleFile = true,
}) {
  let score = 100;

  score -= Math.min(missingCount * 10, 40);
  score -= Math.min(undocumentedCount * 5, 20);
  score -= Math.min(unusedCount * 2, 10);
  if (gitignoreOk === false) score -= 15;
  if (secretsCount > 0) score -= 20;
  if (!hasExampleFile) score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade = GRADES.find((g) => score >= g.min).label;

  const filledBlocks = Math.round(score / 10);
  const bar = '█'.repeat(filledBlocks) + '░'.repeat(10 - filledBlocks);

  return { score, grade, bar };
}
