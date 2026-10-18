import { render, screen } from '@testing-library/react';
import { Home03Icon } from '@hugeicons/core-free-icons';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Icon } from './icon.tsx';

/** The svg a rendered icon drew. */
function svgIn(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('No icon drawn.');
  return svg;
}

describe('Icon', () => {
  it('is skipped by screen readers, since the words beside it carry the meaning', async () => {
    const { container } = render(
      <button type="button">
        <Icon icon={Home03Icon} />
        Home
      </button>,
    );

    expect(svgIn(container)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Home' })).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('draws in the text colour with the shared stroke, so it follows the theme', () => {
    const { container } = render(<Icon icon={Home03Icon} />);

    const svg = svgIn(container);
    expect(svg).toHaveClass('icon');
    const strokes = [...svg.querySelectorAll('[stroke]')];
    expect(strokes.length).toBeGreaterThan(0);
    for (const shape of strokes) {
      expect(shape).toHaveAttribute('stroke', 'currentColor');
      expect(shape).toHaveAttribute('stroke-width', '1.5');
    }
  });

  it('takes a size from its caller', () => {
    const { container } = render(<Icon icon={Home03Icon} className="size-4" />);

    expect(svgIn(container)).toHaveClass('icon', 'size-4');
  });
});
