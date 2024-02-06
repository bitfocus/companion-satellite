// @ts-check
import semver from 'semver'
import inquirer from 'inquirer'
import fs from 'fs'

const ALLOWED_VERSIONS = '^1.5.0'

let currentVersion
try {
	currentVersion = fs.readFileSync('/opt/companion-satellite/BUILD').toString().trim()
} catch (e) {
	// Assume none installed
}

async function getLatestBuildsForBranch(branch, targetCount) {
	targetCount *= 10 // HACK until the api changes
	// eslint-disable-next-line no-undef
	const data = await fetch(
		`https://api.bitfocus.io/v1/product/companion-satellite/packages?branch=${branch}&limit=${targetCount}`
	)
	const jsonData = await data.json()

	// TODO - make sure this is durable
	let target = `${process.platform}-${process.arch}-tgz`
	if (target === 'linux-x64-tgz') target = 'linux-tgz'

	// console.log('searching for', target, 'in', data.data.packages)

	// assume the builds are sorted by date already
	const result = []
	for (const pkg of jsonData.packages) {
		if (pkg.target === target) {
			try {
				if (semver.satisfies(pkg.version, ALLOWED_VERSIONS)) {
					result.push({
						name: pkg.version,
						uri: pkg.uri,
						published: new Date(pkg.published),
					})
				}
			} catch (e) {
				// Not a semver tag, so ignore
			}
		}
	}

	return result
}

async function selectBuildOfType(type, targetBuild) {
	const candidates = await getLatestBuildsForBranch(type, 1)
	const selectedBuild = targetBuild ? candidates.find((c) => c.name == targetBuild) : candidates[0]
	if (selectedBuild) {
		if (selectedBuild.name === currentVersion) {
			console.log(`The latest build of ${type} (${selectedBuild.name}) is already installed`)
		} else {
			console.log(`Selected ${type}: ${selectedBuild.name}`)
			fs.writeFileSync('/tmp/satellite-version-selection', selectedBuild.uri)
			fs.writeFileSync('/tmp/satellite-version-selection-name', selectedBuild.name)
		}
	} else {
		console.error(`No matching ${type} build was found!`)
	}
}
async function chooseOfType(type) {
	const candidates = await getLatestBuildsForBranch(type, 10)

	if (candidates.length === 0) {
		console.error(`No ${type} build was found!`)
	} else {
		const selectedBuild = await inquirer.prompt([
			{
				type: 'list',
				name: 'ref',
				message: 'Which version do you want? ',
				choices: [...candidates.map((c) => c.name), 'cancel'],
			},
		])

		if (selectedBuild.ref && selectedBuild.ref !== 'cancel') {
			if (selectedBuild.ref === currentVersion) {
				const confirm = await inquirer.prompt([
					{
						type: 'confirm',
						name: 'confirm',
						message: `Build "${currentVersion}" is already installed. Do you wish to reinstall it?`,
					},
				])
				if (!confirm.confirm) {
					return
				}
			}

			const build = candidates.find((c) => c.name === selectedBuild.ref)
			if (build) {
				console.log(`Selected ${type}: ${build.name}`)
				fs.writeFileSync('/tmp/satellite-version-selection', build.uri)
				fs.writeFileSync('/tmp/satellite-version-selection-name', build.name)
			} else {
				console.error('Invalid selection!')
			}
		} else {
			console.error('No version was selected!')
		}
	}
}

async function runPrompt() {
	console.log('Warning: Downgrading to an older version can cause issues with the database not being compatible')

	let isOnBeta = true

	console.log(`You are currently on "${currentVersion || 'Unknown'}"`)

	// TODO - restore this
	// if (currentBranch) {
	//     console.log(`You are currently on branch: ${currentBranch}`)
	// } else if (currentTag) {
	//     console.log(`You are currently on release: ${currentTag}`)
	// } else {
	//     console.log('Unable to determine your current version')
	// }

	const answer = await inquirer.prompt([
		{
			type: 'list',
			name: 'ref',
			message: 'What version do you want? ',
			choices: ['latest stable', 'latest beta', 'specific stable', 'specific beta', 'custom-url', 'cancel'],
			default: isOnBeta ? 'latest beta' : 'latest stable',
		},
	])

	if (answer.ref === 'custom-url') {
		console.log(
			'Warning: This must be an linux build of Companion for the correct architecture, or companion will not be able to launch afterwards'
		)
		const answer = await inquirer.prompt([
			{
				type: 'input',
				name: 'url',
				message: 'What build url?',
			},
		])

		const confirm = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'confirm',
				message: `Are you sure you to download the build "${answer.url}"?\nMake sure you trust the source.\nIf you don't know what you are doing you could break your SatellitePi installation`,
			},
		])
		if (!confirm.confirm) {
			return runPrompt()
		} else {
			fs.writeFileSync('/tmp/satellite-version-selection', answer.url)
			fs.writeFileSync('/tmp/satellite-version-selection-name', '')
		}
	} else if (!answer.ref || answer.ref === 'cancel') {
		console.error('No version was selected!')
	} else if (answer.ref === 'latest beta') {
		selectBuildOfType('beta')
	} else if (answer.ref === 'latest stable') {
		selectBuildOfType('stable')
	} else if (answer.ref === 'specific beta') {
		chooseOfType('beta')
	} else if (answer.ref === 'specific stable') {
		chooseOfType('stable')
	}
}

if (process.argv[2]) {
	selectBuildOfType(process.argv[2], process.argv[3])
} else {
	runPrompt()
}
