import type { ReactNode } from 'react';

/**
 * Lets wide tables scroll sideways on small screens instead of widening the page.
 * Focusable so keyboard users can scroll it too.
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be keyboard-reachable (WCAG 2.1.1)
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
