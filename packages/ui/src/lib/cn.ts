import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** tailwind-merge needs to know the custom type sizes, or `text-small` and `text-foreground` would cancel out. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title-lg', 'title', 'body', 'small', 'label', 'code'],
    },
    classGroups: {
      shadow: ['shadow-overlay', 'shadow-none'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
