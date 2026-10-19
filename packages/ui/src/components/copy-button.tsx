import { useEffect, useState } from 'react';
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton, type IconButtonProps } from './icon-button.tsx';

export type CopyButtonProps = Omit<IconButtonProps, 'label' | 'children' | 'onClick' | 'variant'> & {
  /** What it copies, such as a file's path. It also names the button: "Copy src/a.ts". */
  text: string;
  /** Its tooltip until it has copied: "Copy path". */
  label?: string;
  /**
   * Shows only while the pointer is over the row or something in it has focus, as GitHub's copy buttons do. The
   * row takes the `group` class.
   */
  reveal?: 'always' | 'hover';
};

/**
 * Copies a short text to the clipboard (the user's call, 19 Oct 2026): a ghost 32 px icon button whose tooltip
 * says "Copied", with a tick, for 2 s after a press. A copy the browser refuses changes nothing.
 */
export function CopyButton({ text, label = 'Copy path', reveal = 'always', className, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => {
      clearTimeout(reset);
    };
  }, [copied]);
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : `Copy ${text}`}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
          },
          () => undefined,
        );
      }}
      className={cn(
        'shrink-0 text-muted-foreground',
        reveal === 'hover' &&
          'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
        className,
      )}
      {...props}
    >
      <Icon icon={copied ? Tick02Icon : Copy01Icon} aria-hidden />
    </IconButton>
  );
}
