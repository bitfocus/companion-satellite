// module.exports = {
// 	extends: '../node_modules/@sofie-automation/code-standard-preset/eslint/main',

// 	overrides: [
// 		{
// 			files: ['*.ts'],
// 			rules: {
// 				'node/no-missing-import': 'off',
// 				'node/no-unpublished-import': 'off',
// 			},
// 		},
// 	],
// 	settings: {
// 		jest: {
// 			// we don't use jest so don't care about the rules
// 			version: 'latest',
// 		},
// 	},
// }

module.exports = {
	root: true,
	env: { es2020: true },
	extends: [
		'eslint:recommended',
		'plugin:node/recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:@typescript-eslint/recommended-requiring-type-checking',
		'prettier',
		'plugin:prettier/recommended',
	],
	ignorePatterns: ['dist', '.eslintrc.js'],
	parser: '@typescript-eslint/parser',
	parserOptions: { sourceType: 'module', ecmaVersion: 2023, project: './tsconfig.json' },
	plugins: ['@typescript-eslint', 'prettier'],
	rules: {
		'prettier/prettier': 'error',
		'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_(.+)' }],
		'no-extra-semi': 'off',
		'node/no-unsupported-features/es-syntax': ['error', { ignores: ['modules'] }],
		// 'no-use-before-define': 'off',
		// 'no-warning-comments': ['error', { terms: ['nocommit', '@nocommit', '@no-commit'] }],
		'node/no-missing-import': 'off',
		'node/no-unpublished-import': 'off', // because of electron dependencies
		'@typescript-eslint/require-await': 'off', // too much noise

		'@typescript-eslint/restrict-template-expressions': 'off', // TODO temporary
		'@typescript-eslint/no-unsafe-return': 'off', // TODO temporary
		'@typescript-eslint/no-explicit-any': 'off', // TODO temporary
		'@typescript-eslint/no-unsafe-member-access': 'off', // TODO temporary
		'@typescript-eslint/no-unsafe-assignment': 'off', // TODO temporary
	},
}
