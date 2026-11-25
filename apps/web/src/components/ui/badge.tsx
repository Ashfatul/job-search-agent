import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-zinc-800 bg-zinc-900 text-zinc-300',
        indigo: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300',
        emerald: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
        cyan: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300',
        amber: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
        purple: 'border-purple-500/30 bg-purple-500/15 text-purple-300',
        red: 'border-red-500/30 bg-red-500/15 text-red-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
