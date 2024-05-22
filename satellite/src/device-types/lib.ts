export function parseColor(color: string | undefined): { r: number; g: number; b: number } {
	const r = color ? parseInt(color.substr(1, 2), 16) : 0
	const g = color ? parseInt(color.substr(3, 2), 16) : 0
	const b = color ? parseInt(color.substr(5, 2), 16) : 0

	return { r, g, b }
}
