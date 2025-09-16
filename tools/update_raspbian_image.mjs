import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const IMAGING_JSON_URL = 'https://downloads.raspberrypi.org/os_list_imagingutility_v4.json'

const hclPath = fileURLToPath(new URL('../pi-image/satellitepi.pkr.hcl', import.meta.url))

function normalizeChecksum(raw) {
	if (!raw) return null
	// Strip common prefixes and whitespace
	raw = String(raw).trim()
	if (/^sha256:/i.test(raw)) return raw.replace(/^sha256:/i, 'sha256:')
	// If looks like hex of length 64, prefix
	if (/^[0-9a-f]{64}$/i.test(raw)) return `sha256:${raw}`
	// Anything else is invalid for our purposes
	return null
}

async function findImage(items) {
	// Return the first matching item where the url contains 'raspios_lite_arm64'.
	// Walks subitems recursively and returns an array with a single candidate
	async function findInArray(arr) {
		if (!Array.isArray(arr)) return null
		for (const item of arr) {
			if (!item || typeof item !== 'object') continue
			if (item.url && typeof item.url === 'string') {
				const url = String(item.url)
				if (url.includes('raspios_lite_arm64')) {
					// Prefer the JSON `image_download_sha256` when present. Only if that
					// is missing do we attempt to fetch `${url}.sha256` as a fallback.
					let sha = item.image_download_sha256 || null

					if (!sha) {
						try {
							const shaUrl = `${url}.sha256`
							const res = await fetch(shaUrl)
							if (res.ok) {
								const txt = await res.text()
								const m = txt.match(/[0-9a-f]{64}/i)
								if (m) sha = m[0]
							}
						} catch (e) {
							// ignore fetch errors here; we'll fail later if no checksum
						}
					}

					const nsha = normalizeChecksum(sha)
					if (!nsha) throw new Error(`No valid sha256 checksum found for ${url}`)

					return {
						url,
						sha: nsha,
						version: item.release_date || item.version || item.name,
					}
				}
			}
			if (Array.isArray(item.subitems)) {
				const found = await findInArray(item.subitems)
				if (found) return found
			}
		}
		return null
	}

	return await findInArray(items)
}

function replaceHclValues(hclStr, newUrl, newChecksum) {
	let out = hclStr
	// Replace iso_checksum = "..."
	const checksumRe = /(iso_checksum\s*=\s*)"([^"]*)"/
	if (checksumRe.test(out)) {
		out = out.replace(checksumRe, `$1"${newChecksum}"`)
	} else {
		throw new Error('iso_checksum line not found in HCL file')
	}

	const urlRe = /(iso_url\s*=\s*)"([^"]*)"/
	if (urlRe.test(out)) {
		out = out.replace(urlRe, `$1"${newUrl}"`)
	} else {
		throw new Error('iso_url line not found in HCL file')
	}

	return out
}

// Usage: node tools/update_raspbian_image.mjs [--dry-run|-n] [--help]
//
// Fetches the Raspberry Pi imaging utility JSON and updates
// `companionpi.pkr.hcl` `iso_url` and `iso_checksum` fields.
// Use --dry-run to preview changes before writing.

if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log('Usage: node tools/update_raspbian_image.mjs [--dry-run|-n] [--help]')
	console.log('Fetch imaging JSON and update companionpi.pkr.hcl with latest raspios_lite_arm64 image and checksum.')
	process.exit(0)
}
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n')

console.log(`Fetching imaging list from ${IMAGING_JSON_URL}...`)
const apiImagesRaw = await fetch(IMAGING_JSON_URL).then((r) => r.json())
// imaging JSON is expected to be an object with an `os_list` array
if (!apiImagesRaw || !Array.isArray(apiImagesRaw.os_list))
	throw new Error('Unexpected imaging JSON structure: missing os_list array')

const apiImagesList = apiImagesRaw.os_list
console.log(`Found ${apiImagesList.length} items in imaging list`)

const chosenImage = await findImage(apiImagesList)
if (!chosenImage) throw new Error('No suitable raspios_lite_arm64 candidates found in imaging JSON')

console.log('Found image:', chosenImage.url, chosenImage.sha)

const hclStr = await fs.readFile(hclPath, 'utf8')

const newHcl = replaceHclValues(hclStr, chosenImage.url, chosenImage.sha)

if (!dryRun) await fs.writeFile(hclPath, newHcl, 'utf8')
console.log(dryRun ? 'Dry run complete' : `Updated ${path.basename(hclPath)}`)
