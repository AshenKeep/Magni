import { useState } from "react";
import type { LogType, MetricField } from "../../lib/api";
import { METRIC_FIELDS, validFieldsFor } from "../../lib/metrics";
import { DurationInput } from "./DurationInput";

const TIME_FIELDS: MetricField[] = ["duration_seconds", "pace_seconds_per_km"];

export interface DynamicMetricFieldsProps {
  logType: LogType;
  enabled: MetricField[];
  values: Partial<Record<MetricField, number | null>>;
  onEnabledChange: (next: MetricField[]) => void;
  onValueChange: (field: MetricField, value: number | null) => void;
  compact?: boolean;
}

export function DynamicMetricFields({
  logType,
  enabled,
  values,
  onEnabledChange,
  onValueChange,
  compact = false,
}: DynamicMetricFieldsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const valid = validFieldsFor(logType);
  const available = valid.filter(k => !enabled.includes(k));

  const removeField = (k: MetricField) => {
    onEnabledChange(enabled.filter(x => x !== k));
    onValueChange(k, null);
  };

  return (
    <div className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}>
      {enabled.map(key => {
        const def = METRIC_FIELDS[key];
        const isTime = TIME_FIELDS.includes(key);

        return (
          <div
            key={key}
            className={compact ? "flex items-end gap-1" : "flex items-end gap-2"}
          >
            {isTime ? (
              <DurationInput
                value={values[key]}
                onChange={v => onValueChange(key, v)}
                compact={compact}
                label={`${def.label}${key === "pace_seconds_per_km" ? " (/km)" : ""}`}
              />
            ) : (
              <>
                {!compact && (
                  <label className="text-xs text-secondary block min-w-[6rem]">
                    {def.label} {def.unit && <span className="text-secondary/60">({def.unit})</span>}
                  </label>
                )}
                <input
                  type="number"
                  step={def.step ?? 1}
                  placeholder={compact ? def.label : def.placeholder}
                  value={values[key] ?? ""}
                  onChange={e => {
                    const v = e.target.value;
                    onValueChange(key, v === "" ? null : Number(v));
                  }}
                  className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-secondary w-full max-w-[8rem]"
                />
                {compact && def.unit && (
                  <span className="text-xs text-secondary">{def.unit}</span>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => removeField(key)}
              className="text-secondary hover:text-danger text-xs px-1 pb-1"
              title="Remove field"
            >
              ×
            </button>
          </div>
        );
      })}

      {/* + Add field */}
      {available.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="text-xs text-primary hover:underline px-2 py-1"
          >
            + Add field
          </button>
          {pickerOpen && (
            <div className="absolute z-10 mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[10rem]">
              {available.map(k => {
                const def = METRIC_FIELDS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      onEnabledChange([...enabled, k]);
                      setPickerOpen(false);
                    }}
                    className="block w-full text-left text-xs px-3 py-1.5 hover:bg-muted"
                  >
                    {def.label} {def.unit && <span className="text-secondary">({def.unit})</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
