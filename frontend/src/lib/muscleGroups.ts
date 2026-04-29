/**
 * Helpers for the multi-category muscle_groups field.
 *
 * Stored in the DB as a JSON string array, e.g. '["Chest", "Shoulders", "Core"]'.
 * Falls back to single-element array of `muscle_group` if `muscle_groups` is null.
 */

export const MUSCLE_CATEGORIES = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Legs", "Core", "Cardio", "Other",
] as const;

export type MuscleCategory = typeof MUSCLE_CATEGORIES[number];

export function parseMuscleGroups(
  muscle_groups: string | null,
  muscle_group: string | null,
): string[] {
  if (muscle_groups) {
    try {
      const parsed = JSON.parse(muscle_groups);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((x: unknown) => typeof x === "string");
      }
    } catch {
      // fall through to single-tag fallback
    }
  }
  return muscle_group ? [muscle_group] : ["Other"];
}

export function exerciseMatchesMuscle(
  ex: { muscle_groups: string | null; muscle_group: string | null },
  filter: string,
): boolean {
  if (filter === "all" || !filter) return true;
  return parseMuscleGroups(ex.muscle_groups, ex.muscle_group).includes(filter);
}
