import type { Config } from 'prettier';

const config: Config = {
  printWidth: 120,
  singleQuote: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-tailwindcss'],
  // Lets the plugin sort classes in cn(...) and cva(...) calls too.
  tailwindFunctions: ['cn', 'cva'],
  tailwindStylesheet: './packages/ui/src/styles/theme.css',
};

export default config;
