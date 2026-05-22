export interface CountLineInput {
  binId: string;
  skuId: string;
  expectedQty: number;
  countedQty: number;
}

export interface CountLineResult extends CountLineInput {
  variance: number; // counted - expected (negative = shrinkage)
  hasVariance: boolean;
}

export interface CountSummary {
  lines: CountLineResult[];
  binsCounted: number;
  totalAbsVariance: number;
  totalExpected: number;
  /** Accuracy = 1 - (sum|variance| / sum expected), clamped to [0,1]. */
  accuracy: number;
}

export function computeVariance(line: CountLineInput): CountLineResult {
  const variance = line.countedQty - line.expectedQty;
  return { ...line, variance, hasVariance: variance !== 0 };
}

export function summarizeCount(lines: CountLineInput[]): CountSummary {
  const results = lines.map(computeVariance);
  const totalAbsVariance = results.reduce((s, l) => s + Math.abs(l.variance), 0);
  const totalExpected = results.reduce((s, l) => s + l.expectedQty, 0);
  const accuracy = totalExpected === 0 ? 1 : Math.max(0, 1 - totalAbsVariance / totalExpected);
  return {
    lines: results,
    binsCounted: new Set(results.map((l) => l.binId)).size,
    totalAbsVariance,
    totalExpected,
    accuracy,
  };
}
