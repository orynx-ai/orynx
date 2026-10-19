import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './checkbox.tsx';
import { Pill } from './pill.tsx';
import { SettingList, SettingRow } from './setting-row.tsx';
import { Slider } from './slider.tsx';
import { Switch } from './switch.tsx';

function Rows() {
  return (
    <SettingList className="max-w-2xl">
      <SettingRow
        title="Pop-ups inside Orynx"
        titleId="popups"
        description="A small card in the corner while Orynx is open. Also listed under the bell."
        control={<Switch aria-labelledby="popups" defaultChecked />}
      />
      <SettingRow
        title="Desktop notifications"
        titleId="desktop"
        description="Shown by your operating system, even when the Orynx tab is in the background."
        control={<Switch aria-labelledby="desktop" defaultChecked />}
      >
        <span className="mt-1">
          <Pill tone="success">Allowed in this browser</Pill>
        </span>
        <Checkbox label="Only when Orynx isn’t the tab you’re looking at" defaultChecked />
      </SettingRow>
      <SettingRow title="Volume" titleFor="volume">
        <Slider id="volume" min={0} max={100} step={5} defaultValue={60} aria-valuetext="60%" />
      </SettingRow>
    </SettingList>
  );
}

const meta = { title: 'Components/SettingRow', component: Rows } satisfies Meta<typeof Rows>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
