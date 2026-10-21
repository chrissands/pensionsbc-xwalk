module.exports = {
  root: true,
  extends: [
    'airbnb-base',
    'plugin:json/recommended',
    'plugin:xwalk/recommended',
  ],
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
    // page-metadata is page properties, not a block table: allow the topic/audience fields
    'xwalk/max-cells': ['error', { 'page-metadata': 5 }],
  },
  overrides: [{
    // Node command-line tooling, not site code
    files: ['tools/aem-push/**/*.mjs'],
    env: { browser: false, node: true },
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      'no-await-in-loop': 'off',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  }],
};
