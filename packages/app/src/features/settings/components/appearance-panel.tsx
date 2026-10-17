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
    <fieldset className="m-0 flex max-w-120 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 font-medium">Theme</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border bg-raised px-4 has-checked:border-info has-checked:bg-info-subtle"
        >
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={theme === option.value}
            onChange={() => {
              setTheme(option.value);
            }}
            className="m-0 size-5 accent-info"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
