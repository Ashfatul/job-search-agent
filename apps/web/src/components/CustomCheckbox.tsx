'use client';

import { Check } from 'lucide-react';

export function CustomCheckbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer disabled:opacity-50 ${
        checked
          ? 'border-blue-500/50 bg-blue-500/10'
          : 'border-[var(--border)] bg-[var(--bg)] hover:border-slate-600'
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? 'border-blue-500 bg-blue-600 text-white shadow-sm shadow-blue-500/30'
            : 'border-slate-600 bg-[var(--surface)] group-hover:border-slate-400'
        }`}
      >
        {checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[var(--text)]">{label}</span>
        {description && (
          <span className="block text-[11px] text-[var(--muted)] mt-0.5">{description}</span>
        )}
      </span>
    </button>
  );
}

export function CustomSwitch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? 'Toggle'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
        checked
          ? 'border-emerald-500/60 bg-emerald-500/30'
          : 'border-[var(--border)] bg-[var(--bg)]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
          checked ? 'translate-x-5 bg-emerald-400' : 'translate-x-1 bg-slate-400'
        }`}
      />
    </button>
  );
}
