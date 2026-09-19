/**
 * Classic Levenshtein edit distance between two strings.
 */
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[a.length][b.length];
}

/**
 * Finds the closest name to `target` among `candidates`, if any
 * candidate is close enough to plausibly be what the developer meant
 * (a typo / rename / wrong-prefix mistake) rather than an unrelated
 * variable that just happens to share a few characters.
 *
 * @param {string} target - the missing variable name
 * @param {string[]} candidates - documented variable names (from .env.example)
 * @returns {string|null} the best match, or null if nothing is close enough
 */
export function findClosestMatch(target, candidates) {
  let best = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (candidate === target) continue;

    const distance = levenshtein(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (!best) return null;

  // Scale the acceptable distance with name length so short names
  // require near-exact matches, while longer names tolerate more
  // differing characters — env var renames often swap out a whole
  // word (DATABASE_URL -> DB_URL) rather than a single typo.
  const maxLen = Math.max(target.length, best.length);
  const threshold = Math.max(2, Math.round(maxLen * 0.6));

  return bestDistance <= threshold ? best : null;
}
