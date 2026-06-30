export function parseLineParameters(line: string): Record<string, string | boolean> {
	const makeSafe = (index: number): number => {
		return index === -1 ? Number.POSITIVE_INFINITY : index
	}

	const fragments: string[] = ['']
	let quotes = 0

	let i = 0
	while (i < line.length) {
		// Find the next characters of interest
		const spaceIndex = makeSafe(line.indexOf(' ', i))
		const slashIndex = makeSafe(line.indexOf('\\', i))
		const quoteIndex = makeSafe(line.indexOf('"', i))

		// Find which is closest
		const o = Math.min(spaceIndex, slashIndex, quoteIndex)
		if (!isFinite(o)) {
			// None were found, copy the remainder and stop
			const slice = line.substring(i)
			fragments[fragments.length - 1] += slice

			break
		} else {
			// copy the slice before this character
			const slice = line.substring(i, o)
			fragments[fragments.length - 1] += slice

			const c = line[o]
			if (c == '\\') {
				// If char is a slash, the character following it is of interest
				// Future: does this consider non \" chars?
				fragments[fragments.length - 1] += line[o + 1]

				i = o + 2
			} else {
				i = o + 1

				// Figure out what the char was
				if (c === '"') {
					quotes ^= 1
				} else if (!quotes && c === ' ') {
					fragments.push('')
				} else {
					fragments[fragments.length - 1] += c
				}
			}
		}
	}

	const res: Record<string, string | boolean> = Object.create(null)

	for (const fragment of fragments) {
		// Split on the first `=` only, keeping the rest of the value intact. A
		// plain `split('=', 2)` would truncate at the first `=`, which corrupts
		// values that legitimately contain it - e.g. the base64 `=` padding of a
		// `data:` url bitmap, breaking image decoding.
		const splitIndex = fragment.indexOf('=')
		if (splitIndex === -1) {
			res[fragment] = true
		} else {
			res[fragment.substring(0, splitIndex)] = fragment.substring(splitIndex + 1)
		}
	}

	return res
}
