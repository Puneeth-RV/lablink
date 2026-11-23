import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}', 'tests/client/**/*.tsx'],
    ...jsxA11y.flatConfigs.strict,
    plugins: { ...jsxA11y.flatConfigs.strict.plugins, 'react-hooks': reactHooks },
    rules: { ...jsxA11y.flatConfigs.strict.rules, ...reactHooks.configs.recommended.rules },
  },
);
