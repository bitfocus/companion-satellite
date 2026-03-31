import type { GridSize } from '../surfaceProxy.js'
import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/host'

export function calculateGridSize(surfaceLayout: SurfaceSchemaLayoutDefinition): GridSize {
	return Object.values(surfaceLayout.controls).reduce(
		(gridSize, control): GridSize => ({
			columns: Math.max(gridSize.columns, control.column + 1),
			rows: Math.max(gridSize.rows, control.row + 1),
		}),
		{ columns: 0, rows: 0 },
	)
}
