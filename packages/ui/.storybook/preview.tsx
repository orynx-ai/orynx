import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/styles/index.css';

type Theme = 'system' | 'light' | 'dark';

/** Theme is a toolbar switch, never a copy of each story (playbook: "Hundreds of copy-paste stories"). */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals['theme'] as Theme | undefined;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset['theme'] = theme;
  else delete root.dataset['theme'];
  return (
    <div className="bg-canvas p-4 text-foreground">
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'system', title: 'Match my computer' },
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'system' },
  parameters: {
    layout: 'fullscreen',
    // Accessibility violations fail the story test, never just warn (playbook: "Accessibility checks quietly turned off").
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
};

export default preview;
