// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    axe: {
      run: (
        context: Element,
        options: object,
      ) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }>;
    };
  }
}

// axe-core comes with @devhub/ui's tests; here it runs in a real browser, so contrast counts too.
export const axePath = createRequire(new URL('../packages/ui/package.json', import.meta.url)).resolve(
  'axe-core/axe.min.js',
);

/**
 * Waits for every finite animation, so axe never reads a colour half-drawn. A scroll-driven one, such as the
 * sidebar's scroll-fade-y, never finishes, so it's left out.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const moving = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    await Promise.allSettled(moving.map((animation) => animation.finished));
  });
}

/**
 * axe's violations in the page's body, or in the part `selector` names, once anything moving has settled. It waits in
 * the same call that runs axe, so nothing starts fading in between.
 */
export async function axeViolations(page: Page, selector = 'body'): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (context) => {
    const target = document.querySelector(context);
    if (target === null) throw new Error(`Nothing matches ${context}`);
    const moving = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    await Promise.allSettled(moving.map((animation) => animation.finished));
    const results = await window.axe.run(target, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  }, selector);
}
