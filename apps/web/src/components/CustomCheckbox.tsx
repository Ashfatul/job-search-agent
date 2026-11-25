'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <label
      className={cn(
        'group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer select-none',
        checked
          ? 'border-indigo-500/45 bg-indigo-500/10 ring-1 ring-indigo-500/20'
          : 'border-zinc-800/90 bg-zinc-950/70 hover:border-zinc-700',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <CheckboxPrimitive.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(val) => onChange(val === true)}
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
          checked
            ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-950'
            : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-500',
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-zinc-100">{label}</span>
        {description && (
          <span className="block text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{description}</span>
        )}
      </span>
    </label>
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
    <SwitchPrimitive.Root
      checked={checked}
      disabled={disabled}
      aria-label={label ?? 'Toggle'}
      onCheckedChange={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 disabled:opacity-50',
        checked
          ? 'border-emerald-500/50 bg-emerald-500/25'
          : 'border-zinc-700 bg-zinc-900',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-4 w-4 rounded-full shadow-sm transition-transform duration-150',
          checked ? 'translate-x-5 bg-emerald-400' : 'translate-x-1 bg-zinc-400',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
