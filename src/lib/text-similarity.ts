/**
 * Word-level similarity between an AI draft and the reply an admin actually
 * sent (0 = rewritten from scratch, 1 = sent as-is). Ratio of the longest
 * common subsequence of words to the average length, like difflib's ratio.
 * Used to measure how useful drafts are, not for anything user-facing.
 */
const MAX_WORDS = 1500;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}₹\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

export function draftSimilarity(draft: string, sent: string): number {
  const a = words(draft);
  const b = words(sent);
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // O(n*m) LCS with a rolling row; ≤ 1500 words each keeps this cheap.
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  const lcs = prev[b.length];
  return Math.round(((2 * lcs) / (a.length + b.length)) * 1000) / 1000;
}
