const TOTE_COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'teal'];

/** Assign each order in a batch wave to a labelled tote (1-indexed, with a colour). */
export function assignTotes(orderIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  orderIds.forEach((orderId, i) => {
    map[orderId] = `T${i + 1}`;
  });
  return map;
}

export function toteLabel(toteId: string): { number: number; color: string } {
  const number = Number.parseInt(toteId.replace(/^T/, ''), 10) || 1;
  return { number, color: TOTE_COLORS[(number - 1) % TOTE_COLORS.length]! };
}
