import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SettingList, SettingRow } from './setting-row.tsx';
import { Slider } from './slider.tsx';
import { Switch } from './switch.tsx';

describe('SettingRow (spec 029)', () => {
  it('AC-33: names its control by its title, and shows its description', async () => {
    const { container } = render(
      <SettingList>
        <SettingRow
          title="Pop-ups inside Orynx"
          titleId="popups"
          description="A small card in the corner while Orynx is open."
          control={<Switch aria-labelledby="popups" />}
        />
      </SettingList>,
    );

    expect(screen.getByRole('switch', { name: 'Pop-ups inside Orynx' })).toBeVisible();
    expect(screen.getByText('A small card in the corner while Orynx is open.')).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('AC-37: its title can be the label of a control under it', () => {
    render(
      <SettingRow title="Volume" titleFor="volume">
        <Slider id="volume" />
      </SettingRow>,
    );

    expect(screen.getByRole('slider', { name: 'Volume' })).toBeVisible();
  });
});
