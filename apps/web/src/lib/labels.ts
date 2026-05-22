/** Plain-language labels for internal codes — keeps the UI jargon-free and consistent. */

export function demandLabel(tier: 'A' | 'B' | 'C' | null | undefined): string {
  return tier === 'A' ? 'Fast' : tier === 'B' ? 'Medium' : tier === 'C' ? 'Slow' : '—';
}

export function demandTone(tier: 'A' | 'B' | 'C' | null | undefined): 'green' | 'blue' | 'slate' {
  return tier === 'A' ? 'green' : tier === 'B' ? 'blue' : 'slate';
}

export const deadlineLabel: Record<string, string> = {
  OVERDUE: 'Late',
  SOON: 'Due soon',
  TODAY: 'Today',
  FUTURE: 'Upcoming',
};

export const deadlineTone: Record<string, 'red' | 'amber' | 'blue' | 'slate'> = {
  OVERDUE: 'red',
  SOON: 'amber',
  TODAY: 'blue',
  FUTURE: 'slate',
};

export const pickListStatusLabel: Record<string, string> = {
  DRAFT: 'Draft',
  RELEASED: 'Ready',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Done',
};

export function pickListStatusTone(status: string): 'green' | 'blue' | 'amber' | 'slate' {
  return status === 'COMPLETED' ? 'green' : status === 'IN_PROGRESS' ? 'blue' : status === 'RELEASED' ? 'amber' : 'slate';
}

export const activityLabel: Record<string, string> = {
  PICK: 'Picked',
  ADJUSTMENT: 'Adjusted',
  RECEIPT: 'Received',
  COUNT: 'Counted',
  TRANSFER: 'Moved',
  RETURN: 'Returned',
};
