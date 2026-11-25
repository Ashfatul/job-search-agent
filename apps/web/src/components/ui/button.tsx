import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.99]',
  {
    variants: {
      variant: {
        primary:
          'bg-indigo-600 text-white shadow-sm shadow-indigo-950/50 hover:bg-indigo-500 border border-indigo-500/60',
        secondary:
          'bg-zinc-800/90 text-zinc-100 hover:bg-zinc-700/90 border border-zinc-700/70',
        outline:
          'border border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-zinc-900 hover:border-zinc-700',
        ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
        success:
          'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 hover:bg-emerald-500/25',
        danger:
          'bg-red-500/15 text-red-300 border border-red-500/35 hover:bg-red-500/25',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-xs',
        lg: 'h-10 px-5 text-sm',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
