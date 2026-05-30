/**
 * Zero-dependency Offline Token Estimator.
 * Establishes consistent token estimation for Llama and GPT-4 model families.
 * 
 * Heuristics:
 * - 1 token ≈ 4.0 characters (English text).
 * - 1 token ≈ 0.75 words.
 * - Code elements (backticks, brackets, curly braces) have a higher token-to-character ratio.
 */

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  
  const charCount = text.length;
  if (charCount === 0) return 0;
  
  // Count words by splitting on whitespace
  const words = text.trim().split(/\s+/);
  const wordCount = words.length === 1 && words[0] === '' ? 0 : words.length;

  // Base estimations
  const charBasedEstimate = charCount / 4.0;
  const wordBasedEstimate = wordCount / 0.75;
  
  // Combined average
  let baseEstimate = (charBasedEstimate + wordBasedEstimate) / 2;

  // Adjust for code characters (brackets, math, syntax) which tokenizers break down into single tokens
  const codeSymbolsPattern = /[{}[\]()<>`+\-*/=%;&|]/g;
  const symbolCount = (text.match(codeSymbolsPattern) || []).length;
  
  // Add a weighting penalty for symbols
  baseEstimate += symbolCount * 0.4;

  // Ensure returning a positive rounded integer
  return Math.max(1, Math.round(baseEstimate));
}

export function formatTokenMetric(tokenCount: number): string {
  if (tokenCount >= 1000000) {
    return (tokenCount / 1000000).toFixed(1) + 'M';
  }
  if (tokenCount >= 1000) {
    return (tokenCount / 1000).toFixed(1) + 'k';
  }
  return tokenCount.toString();
}
