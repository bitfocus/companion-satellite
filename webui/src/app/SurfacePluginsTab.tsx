import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context'
import { ApiModuleStoreEntry, ApiSurfacePluginsEnabled, ApiInstalledModuleInfo, ApiModuleUpdateInfo } from '@/Api/types'
import { BarLoader } from 'react-spinners'
import { useForm } from '@tanstack/react-form'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { MyErrorBoundary } from '@/Util/ErrorBoundary'
import { CONNECTED_SURFACES_QUERY_KEY, SURFACE_PLUGINS_ENABLED_QUERY_KEY } from './constants'
import { JSX, useState } from 'react'

const MODULES_UPDATES_QUERY_KEY = 'modulesUpdates'

export function SurfacePluginsTab(): JSX.Element {
	const api = useSatelliteApi()

	const modulesAvailable = useQuery({
		queryKey: ['modulesAvailable'],
		queryFn: async () => api.modulesAvailable(),
	})

	const modulesInstalled = useQuery({
		queryKey: ['modulesInstalled'],
		queryFn: async () => api.modulesInstalled(),
	})

	const modulesUpdates = useQuery({
		queryKey: [MODULES_UPDATES_QUERY_KEY],
		queryFn: async () => api.modulesUpdates(),
	})

	const surfacePluginsEnabled = useQuery({
		queryKey: [SURFACE_PLUGINS_ENABLED_QUERY_KEY],
		queryFn: async () => api.surfacePluginsEnabled(),
	})

	const loadingError = modulesAvailable.error || modulesInstalled.error || surfacePluginsEnabled.error

	return (
		<div>
			<h3 className="text-2xl font-bold dark:text-white">Surface Plugins</h3>

			<p className="text-sm text-gray-500 p-1">
				Here you can enable or disable support for the different surface types.
				<br />
				Modules are downloaded from the Bitfocus Module Store when enabled.
			</p>

			{modulesAvailable.isLoading || modulesInstalled.isLoading || surfacePluginsEnabled.isLoading ? (
				<BarLoader color="#ffffff" className="mt-4" />
			) : null}
			{loadingError ? <p>Error: {loadingError.message.toString()}</p> : null}
			{modulesAvailable.data && modulesInstalled.data && surfacePluginsEnabled.data && (
				<MyErrorBoundary>
					<SurfacePluginsConfig
						modules={modulesAvailable.data.modules}
						installed={modulesInstalled.data.modules}
						updates={modulesUpdates.data?.updates ?? []}
						config={surfacePluginsEnabled.data}
					/>
				</MyErrorBoundary>
			)}
		</div>
	)
}

function SurfacePluginsConfig({
	modules,
	installed,
	updates,
	config,
}: {
	modules: ApiModuleStoreEntry[]
	installed: ApiInstalledModuleInfo[]
	updates: ApiModuleUpdateInfo[]
	config: ApiSurfacePluginsEnabled
}): JSX.Element {
	const api = useSatelliteApi()
	const queryClient = useQueryClient()
	const [installing, setInstalling] = useState<string | null>(null)
	const [updating, setUpdating] = useState<string | null>(null)

	const installedMap = new Map(installed.map((m) => [m.id, m]))
	const updatesMap = new Map(updates.map((u) => [u.moduleId, u]))

	const installMutation = useMutation({
		mutationFn: async (moduleId: string) => {
			setInstalling(moduleId)
			const result = await api.installModule(moduleId)
			if (!result.success) {
				throw new Error(result.error || 'Installation failed')
			}
			return result
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['modulesInstalled'] })
			await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
		},
		onSettled: () => {
			setInstalling(null)
		},
	})

	const updateMutation = useMutation({
		mutationFn: async ({ moduleId, version }: { moduleId: string; version: string }) => {
			setUpdating(moduleId)
			const result = await api.installModule(moduleId, version)
			if (!result.success) {
				throw new Error(result.error || 'Update failed')
			}
			return result
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['modulesInstalled'] })
			await queryClient.invalidateQueries({ queryKey: [MODULES_UPDATES_QUERY_KEY] })
			await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
		},
		onSettled: () => {
			setUpdating(null)
		},
	})

	const form = useForm({
		defaultValues: config,
		onSubmit: async ({ value }) => {
			console.log('saving', value)
			const savedData = await api.surfacePluginsEnabledUpdate(value)
			console.log('new', savedData)
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
			<div className="grid gap-3 grid-cols-6 mt-2">
				{modules.map((module) => {
					const isInstalled = installedMap.has(module.id)
					const installedVersion = installedMap.get(module.id)?.version
					const updateInfo = updatesMap.get(module.id)
					const hasUpdate = !!updateInfo

					// Use first product name for cleaner display
					const displayName = module.products?.[0] ?? module.name

					return (
						<form.Field
							key={module.id}
							name={module.id}
							children={(field) => (
								<>
									<Label className="justify-self-end content-center col-span-2" htmlFor={field.name}>
										{displayName}
									</Label>
									<div className="col-span-1 content-center">
										<Switch
											id={field.name}
											name={field.name}
											checked={field.state.value || false}
											onBlur={field.handleBlur}
											onCheckedChange={(checked) => field.handleChange(checked)}
										/>
									</div>
									<div className="col-span-3 content-center text-sm flex items-center gap-2">
										{isInstalled ? (
											<>
												<span className={hasUpdate ? 'text-yellow-500' : 'text-green-500'}>v{installedVersion}</span>
												{hasUpdate && (
													<>
														{updating === module.id ? (
															<span className="text-yellow-500">Updating...</span>
														) : (
															<Button
																type="button"
																variant="outline"
																size="sm"
																onClick={() =>
																	updateMutation.mutate({
																		moduleId: module.id,
																		version: updateInfo.latestVersion,
																	})
																}
																disabled={updating !== null || installing !== null}
															>
																Update to v{updateInfo.latestVersion}
															</Button>
														)}
													</>
												)}
											</>
										) : field.state.value ? (
											installing === module.id ? (
												<span className="text-yellow-500">Installing...</span>
											) : (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => installMutation.mutate(module.id)}
													disabled={installing !== null || updating !== null}
												>
													Install
												</Button>
											)
										) : (
											<span className="text-gray-500">Not installed</span>
										)}
									</div>
								</>
							)}
						/>
					)
				})}

				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}
					children={([canSubmit, isSubmitting, isDirty]) => (
						<div className="col-span-4 col-start-3 flex justify-start">
							<Button type="submit" disabled={!canSubmit || !isDirty}>
								{isSubmitting ? '...' : 'Save'}
							</Button>
						</div>
					)}
				/>
			</div>
		</form>
	)
}
