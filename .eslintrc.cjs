module.export = {
	extends: './node_modules/@sofie-automation/code-standard-preset/eslint/main',

	overrides: [
		{
			files: ['*.ts'],
			rules: {
				'node/no-missing-import': 'off',
				'node/no-unpublished-import': 'off',
			},
		},
	],
	settings: {
		jest: {
			// we don't use jest so don't care about the rules
			version: 'latest',
		},
	},
}
