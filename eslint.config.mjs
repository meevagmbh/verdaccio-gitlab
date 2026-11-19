import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['build/', 'coverage/', 'node_modules/', '.yarn/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Carried over from the previous config: the plugin and its tests talk to
      // untyped verdaccio and gitlab structures.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // Test suites share one (server, gitlab) signature; unused ones carry a _ prefix.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // CommonJS config, mocks and launchers.
    files: ['**/*.js', 'bin/*'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  }
);
