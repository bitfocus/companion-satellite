import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context'
import { ApiSurfacePluginInfo, ApiSurfacePluginsEnabled } from '@/Api/types'
import { BarLoader } from 'react-spinners'
import { useForm } from '@tanstack/react-form'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { MyErrorBoundary } from '@/Util/ErrorBoundary'
import { CONNECTED_SURFACES_QUERY_KEY, SURFACE_PLUGINS_ENABLED_QUERY_KEY } from './constants'

export function SurfacePluginsTab(): JSX.Element {
	const api = useSatelliteApi()
	const surfacePlugins = useQuery({
		queryKey: ['surfacePlugins'],
		queryFn: async () => api.surfacePlugins(),
	})

	const surfacePluginsEnabled = useQuery({
		queryKey: [SURFACE_PLUGINS_ENABLED_QUERY_KEY],
		queryFn: async () => api.surfacePluginsEnabled(),
	})

	const loadingError = surfacePlugins.error || surfacePluginsEnabled.error

	return (
		<div>
			<h3 className="text-2xl font-bold dark:text-white">Surface Plugins</h3>

			<p className="text-sm text-gray-500 p-1">
				Here you can enable or disable support for the different surface types.
				<br />
				In the future, we expect to make these be installable plugins.
			</p>

			{surfacePlugins.isLoading || surfacePluginsEnabled.isLoading ? (
				<BarLoader color="#ffffff" className="mt-4" />
			) : null}
			{loadingError ? <p>Error: {loadingError.message.toString()}</p> : null}
			{surfacePlugins.data && surfacePluginsEnabled.data && (
				<MyErrorBoundary>
					<SurfacePluginsConfig plugins={surfacePlugins.data} config={surfacePluginsEnabled.data} />
				</MyErrorBoundary>
			)}
		</div>
	)
}

function SurfacePluginsConfig({
	plugins,
	config,
}: {
	plugins: ApiSurfacePluginInfo[]
	config: ApiSurfacePluginsEnabled
}): JSX.Element {
	const api = useSatelliteApi()
	const queryClient = useQueryClient()

	const form = useForm<ApiSurfacePluginsEnabled>({
		defaultValues: config,
		onSubmit: async ({ value }) => {
			// Do something with form data
			console.log('saving', value)

			const savedData = await api.surfacePluginsEnabledUpdate(value)

			console.log('new', savedData)
			// TODO - this doesn't work
			// form.reset(savedData)
			await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
		},
	})

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit().catch((e) => console.error(e))
			}}
		>
			<div className="grid gap-3 grid-cols-5 mt-2">
				{plugins.map((plugin) => (
					<form.Field
						name={plugin.pluginId}
						children={(field) => (
							<>
								<Label className="text-right content-center col-span-2" htmlFor={field.name}>
									{plugin.pluginName}
								</Label>
								<div className="col-span-3">
									<Switch
										id={field.name}
										name={field.name}
										checked={field.state.value || false}
										onBlur={field.handleBlur}
										onCheckedChange={(checked) => field.handleChange(checked)}
									/>
								</div>
								{plugin.pluginComment && (
									<div className="col-span-3 col-start-3 -mt-3">
										<p className="text-sm text-gray-500 p-1">
											{plugin.pluginComment.map((line) => (
												<>
													{line}
													<br />
												</>
											))}
										</p>
									</div>
								)}
							</>
						)}
					/>
				))}

				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}
					children={([canSubmit, isSubmitting, isDirty]) => (
						<div className="col-span-3 col-start-3 flex justify-start">
							<Button type="submit" disabled={!canSubmit || !isDirty}>
								{isSubmitting ? '...' : 'Submit'}
							</Button>
						</div>
					)}
				/>
			</div>
		</form>
	)
}
