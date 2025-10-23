/** @deprecated */
export interface SurfaceProxyDrawProps {
	deviceId: string
	keyIndex: number | undefined
	controlId: string | undefined
	image?: Buffer
	color?: string // hex
	text?: string
}

export interface GridSize {
	rows: number
	columns: number
}
