/**
 * Task Diff Utility
 *
 * Compares task states and computes field-level differences.
 * Used for task update operations and activity logging.
 *
 * Extracted from: app/api/mcp/tasks/action/route.ts (lines 25-50)
 */

/**
 * Computes differences between two task states
 *
 * @param before - Previous task state
 * @param after - New task state
 * @param fields - Fields to compare
 * @returns Array of changed fields with before/after values
 */
export function computeTaskDiff(
  before: any,
  after: any,
  fields: string[]
): Array<{ field: string; from: any; to: any }> {
  const diff: Array<{ field: string; from: any; to: any }> = [];

  for (const field of fields) {
    const beforeValue = before?.[field];
    const afterValue = after?.[field];

    // Compare values (handle Date objects, nulls, etc.)
    const beforeStr = beforeValue instanceof Date ? beforeValue.toISOString() : beforeValue;
    const afterStr = afterValue instanceof Date ? afterValue.toISOString() : afterValue;

    if (beforeStr !== afterStr) {
      diff.push({
        field,
        from: beforeValue,
        to: afterValue
      });
    }
  }

  return diff;
}
