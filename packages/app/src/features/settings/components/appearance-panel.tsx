import { ChoiceCard, ChoiceGroup } from '@devhub/ui';
import { useThemeStore, type Theme } from '../../../stores/theme-store.ts';

const options: readonly { value: Theme; label: string }[] = [
  { value: 'system', label: 'Match my computer' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Settings › Appearance. Saves as you choose (spec: "changes save as you make them"). */
export function AppearancePanel() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <ChoiceGroup legend="Theme" className="max-w-120">
      {options.map((option) => (
        <ChoiceCard
          key={option.value}
          name="theme"
          value={option.value}
          title={option.label}
          checked={theme === option.value}
          onChange={() => {
            setTheme(option.value);
          }}
        />
      ))}
    </ChoiceGroup>
  );
}
