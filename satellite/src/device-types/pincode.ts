import { SurfacePincodeMap } from './api.js'

/**
 * This file contains some default pincode layouts, and utils for generating simple layouts.
 * These should be used by plugins when appropriate, so that the layouts are consistent across devices.
 * But it is ok to use custom layouts if needed.
 */

export function Pincode5x3(x = 0, y = 0): SurfacePincodeMap {
	return {
		type: 'single-page',
		pincode: [x, y + 1],
		0: [x + 4, y + 1],
		1: [x + 1, y + 2],
		2: [x + 2, y + 2],
		3: [x + 3, y + 2],
		4: [x + 1, y + 1],
		5: [x + 2, y + 1],
		6: [x + 3, y + 1],
		7: [x + 1, y],
		8: [x + 2, y],
		9: [x + 3, y],
	}
}

export function Pincode4x3(x = 0, y = 0): SurfacePincodeMap {
	return {
		type: 'single-page',
		pincode: [x, y],
		0: [x, y + 2],
		1: [x + 1, y + 2],
		2: [x + 2, y + 2],
		3: [x + 3, y + 2],
		4: [x + 1, y + 1],
		5: [x + 2, y + 1],
		6: [x + 3, y + 1],
		7: [x + 1, y],
		8: [x + 2, y],
		9: [x + 3, y],
	}
}

export function Pincode4x4(x = 0, y = 0): SurfacePincodeMap {
	return {
		type: 'single-page',
		pincode: [x, y + 1],
		0: [x + 2, y + 3],
		1: [x + 1, y + 2],
		2: [x + 2, y + 2],
		3: [x + 3, y + 2],
		4: [x + 1, y + 1],
		5: [x + 2, y + 1],
		6: [x + 3, y + 1],
		7: [x + 1, y],
		8: [x + 2, y],
		9: [x + 3, y],
	}
}

export function Pincode6x2(x = 0, y = 0): SurfacePincodeMap {
	return {
		type: 'single-page',
		pincode: [x, y],
		0: [x + 1, y + 1],
		1: [x + 2, y + 1],
		2: [x + 3, y + 1],
		3: [x + 4, y + 1],
		4: [x + 5, y + 1],
		5: [x + 1, y],
		6: [x + 2, y],
		7: [x + 3, y],
		8: [x + 4, y],
		9: [x + 5, y],
	}
}
