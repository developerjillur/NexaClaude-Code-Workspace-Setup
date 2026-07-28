// Flat config, ESLint 9+.
//
// Deliberately short. A linter with 200 rules gets its output ignored, and an ignored linter is
// worse than none because the badge still says it ran.
//
// Each rule below maps to a specific way agent-written code goes wrong.

export default [
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // ── the ones that catch agent-shaped mistakes ──────────────────────────
      // A variable assigned and never read is usually half of a refactor that stopped.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Agents reach for a name they remember rather than one that exists.
      'no-undef': 'error',
      // Two implementations of the same thing, one of them dead.
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-imports': 'error',
      // A promise nobody awaited is the commonest silent failure in generated code.
      'require-atomic-updates': 'error',
      'no-async-promise-executor': 'error',
      // An empty catch is the shape depth-check hunts for; the linter can say it sooner.
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Debug output that shipped.
      'no-debugger': 'error',
      // Comparison that silently coerces — the bug that survives review because it reads fine.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Reassigning a parameter hides where a value came from.
      'no-param-reassign': ['error', { props: false }],
      // Fall-through is almost always the missing break.
      'no-fallthrough': 'error',
    },
  },
  {
    // Test files legitimately do things production code must not.
    files: ['**/test/**', '**/tests/**', '**/*.test.*'],
    rules: { 'no-empty': 'off' },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '**/._*'],
  },
];
