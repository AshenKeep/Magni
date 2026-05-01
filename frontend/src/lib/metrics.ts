// Shared metadata for metric fields used in template/workout set forms.
// Drives the "+ Add field" dropdown and renders inputs uniformly.

import type { LogType, MetricField } from "./api";

export interface MetricFieldDef {
  key: MetricField;
  label: string;
  unit: string;
  placeholder: string;
  /** Step for number input — finer for distance/weight, integer for reps/laps. */
  step?: number;
  /** Default fields to show (without the user adding any) per log type. */
  defaultFor: LogType[];
  /** All log types this field is appropriate for (controls dropdown options). */
  validFor: LogType[];
}

export const METRIC_FIELDS: Record<MetricField, MetricFieldDef> = {
  reps: {
    key: "reps",
    label: "Reps",
    unit: "",
    placeholder: "e.g. 10",
    step: 1,
    defaultFor: ["strength"],
    validFor: ["strength", "mobility"],
  },
  weight_kg: {
    key: "weight_kg",
    label: "Weight",
    unit: "kg",
    placeholder: "e.g. 60",
    step: 0.5,
    defaultFor: ["strength"],
    validFor: ["strength"],
  },
  duration_seconds: {
    key: "duration_seconds",
    label: "Duration",
    unit: "sec",
    placeholder: "e.g. 1500",
    step: 1,
    defaultFor: ["cardio", "mobility"],
    validFor: ["cardio", "strength", "mobility"],
  },
  distance_m: {
    key: "distance_m",
    label: "Distance",
    unit: "m",
    placeholder: "e.g. 5000",
    step: 1,
    defaultFor: ["cardio"],
    validFor: ["cardio"],
  },
  pace_seconds_per_km: {
    key: "pace_seconds_per_km",
    label: "Pace",
    unit: "sec/km",
    placeholder: "e.g. 360",
    step: 1,
    defaultFor: [],
    validFor: ["cardio"],
  },
  incline_pct: {
    key: "incline_pct",
    label: "Incline / resistance",
    unit: "%",
    placeholder: "e.g. 5",
    step: 0.5,
    defaultFor: [],
    validFor: ["cardio"],
  },
  laps: {
    key: "laps",
    label: "Laps",
    unit: "",
    placeholder: "e.g. 20",
    step: 1,
    defaultFor: [],
    validFor: ["cardio"],
  },
  avg_heart_rate: {
    key: "avg_heart_rate",
    label: "Avg HR",
    unit: "bpm",
    placeholder: "e.g. 145",
    step: 1,
    defaultFor: [],
    validFor: ["cardio", "strength"],
  },
  calories: {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    placeholder: "e.g. 250",
    step: 1,
    defaultFor: [],
    validFor: ["cardio"],
  },
};

export const ALL_METRIC_FIELDS: MetricField[] = [
  "reps", "weight_kg",
  "duration_seconds", "distance_m", "pace_seconds_per_km",
  "incline_pct", "laps", "avg_heart_rate", "calories",
];

export function defaultFieldsFor(logType: LogType): MetricField[] {
  return ALL_METRIC_FIELDS.filter(k => METRIC_FIELDS[k].defaultFor.includes(logType));
}

export function validFieldsFor(logType: LogType): MetricField[] {
  return ALL_METRIC_FIELDS.filter(k => METRIC_FIELDS[k].validFor.includes(logType));
}

/** Maps the form `MetricField` keys to the corresponding TemplateSet payload keys. */
export const METRIC_TO_TEMPLATE_SET_KEY: Record<MetricField, string> = {
  reps: "target_reps",
  weight_kg: "target_weight_kg",
  duration_seconds: "target_duration_seconds",
  distance_m: "target_distance_m",
  pace_seconds_per_km: "target_pace_seconds_per_km",
  incline_pct: "target_incline_pct",
  laps: "target_laps",
  avg_heart_rate: "target_avg_heart_rate",
  calories: "target_calories",
};

/** Maps form keys to corresponding WorkoutSet payload keys (no "target_" prefix). */
export const METRIC_TO_WORKOUT_SET_KEY: Record<MetricField, string> = {
  reps: "reps",
  weight_kg: "weight_kg",
  duration_seconds: "duration_seconds",
  distance_m: "distance_m",
  pace_seconds_per_km: "pace_seconds_per_km",
  incline_pct: "incline_pct",
  laps: "laps",
  avg_heart_rate: "avg_heart_rate",
  calories: "calories",
};

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
};

/** Format seconds → hh:mm:ss or mm:ss for display. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format pace seconds/km → mm:ss/km. */
export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null) return "";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
