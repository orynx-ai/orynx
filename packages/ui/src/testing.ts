/**
 * Test helpers for packages that render @devhub/ui. These check real output; they do not
 * replace any component.
 */
import axe from 'axe-core';

/**
 * Runs axe on a rendered container and throws with a readable list if anything fails.
 * Colour contrast is skipped because jsdom does not compute styles; Storybook's a11y
 * addon checks contrast in a real browser.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  if (results.violations.length === 0) return;
  const lines = results.violations.map(
    (v) => `- ${v.id}: ${v.help} (${String(v.nodes.length)} node${v.nodes.length === 1 ? '' : 's'})\n  ${v.helpUrl}`,
  );
  throw new Error(`Accessibility violations:\n${lines.join('\n')}`);
}
