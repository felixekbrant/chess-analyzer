import { useState } from 'react';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export interface PickerOption<T extends string | number> {
  value: T;
  label: string;
}

/**
 * A choice as a pill button that opens a sheet of options (instead of the browser's own select).
 * `label` names the choice for screen readers and titles the sheet.
 */
export function Picker<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string;
  value: T;
  options: PickerOption<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold bg-[var(--panel-2)] hover:brightness-110 ${className}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label}: ${current?.label ?? ''}`}
      >
        <span className="truncate">{current?.label ?? label}</span>
        <Icon name="chevronDown" size={14} className="muted shrink-0" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="grid gap-1" role="radiogroup" aria-label={label}>
          {options.map((o) => (
            <button
              key={String(o.value)}
              role="radio"
              aria-checked={o.value === value}
              className={`flex items-center justify-between px-3 py-3 rounded-lg font-semibold text-left ${
                o.value === value ? 'bg-[var(--panel-2)]' : 'hover:bg-[var(--panel-2)]'
              }`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              {o.value === value && <Icon name="check" size={18} className="text-accent" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
