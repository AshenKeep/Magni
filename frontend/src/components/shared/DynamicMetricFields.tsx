import { useState } from "react";
import type { LogType, MetricField } from "../../lib/api";
import { METRIC_FIELDS, validFieldsFor } from "../../lib/metrics";

/**
 * Renders a row of metric inputs with a "+ Add field" dropdown.
 * The parent owns:
 *   - `enabled` — which fields are currently shown
 *   - `values`  — the current numeric value for each field (or undefined)
 *   - `onChange` — fires with the merged state when anything changes
 */
export interface DynamicMetricFieldsProps {
  logType: LogType;
  enabled: MetricField[];
  values: Partial<Record<MetricField, number | null>>;
  onEnabledChange: (next: MetricField[]) => void;
  onValueChange: (field: MetricField, value: number | null) => void;
  /** Compact mode renders fields side-by-side without labels above. */
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
    <div className={compact ? "flex flex-wrap items-end gap-2" : "space-y-2"}>
      {enabled.map(key => {
        const def = METRIC_FIELDS[key];
        return (
          <div
            key={key}
            className={compact ? "flex items-end gap-1" : "flex items-end gap-2"}
          >
            {!compact && (
              <label className="text-xs text-text-muted block min-w-[6rem]">
                {def.label} {def.unit && <span className="text-text-muted/60">({def.unit})</span>}
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
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm w-full max-w-[8rem]"
            />
            {compact && def.unit && (
              <span className="text-xs text-text-muted">{def.unit}</span>
            )}
            <button
              type="button"
              onClick={() => removeField(key)}
              className="text-text-muted hover:text-danger text-xs px-1"
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
            <div className="absolute z-10 mt-1 bg-bg-secondary border border-border rounded-lg shadow-lg py-1 min-w-[10rem]">
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
                    className="block w-full text-left text-xs px-3 py-1.5 hover:bg-bg-tertiary"
                  >
                    {def.label} {def.unit && <span className="text-text-muted">({def.unit})</span>}
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
