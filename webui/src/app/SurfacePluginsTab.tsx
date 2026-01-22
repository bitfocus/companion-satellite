import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context'
import { ApiModuleStoreEntry, ApiSurfacePluginsEnabled, ApiInstalledModuleInfo, ApiModuleUpdateInfo } from '@/Api/types'
import { BarLoader } from 'react-spinners'
import { useForm } from '@tanstack/react-form'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { MyErrorBoundary } from '@/Util/ErrorBoundary'
import {
	CONNECTED_SURFACES_QUERY_KEY,
	SURFACE_PLUGINS_ENABLED_QUERY_KEY,
	MODULES_UPDATES_QUERY_KEY,
	MODULES_AVAILABLE_QUERY_KEY,
	MODULES_INSTALLED_QUERY_KEY,
} from './constants'
import { JSX, useState } from 'react'

interface OperationState {
	type: 'installing' | 'updating' | 'uninstalling' | null
	moduleId: string | null
}

interface ModuleStatusProps {
	module: ApiModuleStoreEntry
	isInstalled: boolean
	installedVersion: string | undefined
	updateInfo: ApiModuleUpdateInfo | undefined
	isEnabled: boolean
	operation: OperationState
	isOperationInProgress: boolean
	onInstall: () => void
	onUpdate: (version: string) => void
	onUninstall: (version: string) => void
}

function ModuleStatus({
	module,
	isInstalled,
	installedVersion,
	updateInfo,
	isEnabled,
	operation,
	isOperationInProgress,
	onInstall,
	onUpdate,
	onUninstall,
}: ModuleStatusProps): JSX.Element {
	const hasUpdate = !!updateInfo
	const isThisModuleOperating = operation.moduleId === module.id

	if (isInstalled) {
		return (
			<>
				<span className={hasUpdate ? 'text-yellow-500' : 'text-green-500'}>v{installedVersion}</span>
				<span className="flex items-center gap-2">
					{hasUpdate && (
						<>
							{isThisModuleOperating && operation.type === 'updating' ? (
								<span className="text-yellow-500">Updating...</span>
							) : (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => onUpdate(updateInfo.latestVersion)}
									disabled={isOperationInProgress}
								>
									Update to v{updateInfo.latestVersion}
								</Button>
							)}
						</>
					)}
					{!isEnabled && installedVersion && (
						<>
							{isThisModuleOperating && operation.type === 'uninstalling' ? (
								<span className="text-yellow-500">Uninstalling...</span>
							) : (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => onUninstall(installedVersion)}
									disabled={isOperationInProgress}
								>
									Uninstall
								</Button>
							)}
						</>
					)}
				</span>
			</>
		)
	}

	if (isEnabled) {
		if (isThisModuleOperating && operation.type === 'installing') {
			return <span className="text-yellow-500">Installing...</span>
		}
		return (
			<Button type="button" variant="outline" size="sm" onClick={onInstall} disabled={isOperationInProgress}>
				Install
			</Button>
		)
	}

	return <span className="text-gray-500">Not installed</span>
}

interface ModuleFieldApi {
	name: string
	state: { value: boolean | undefined }
	handleBlur: () => void
	handleChange: (value: boolean) => void
}

interface ModuleRowProps {
	module: ApiModuleStoreEntry
	installedVersion: string | undefined
	updateInfo: ApiModuleUpdateInfo | undefined
	config: ApiSurfacePluginsEnabled
	operation: OperationState
	isOperationInProgress: boolean
	field: ModuleFieldApi
	onInstall: (moduleId: string) => void
	onUpdate: (moduleId: string, version: string) => void
	onUninstall: (moduleId: string, version: string) => void
}

function ModuleRow({
	module,
	installedVersion,
	updateInfo,
	config,
	operation,
	isOperationInProgress,
	field,
	onInstall,
	onUpdate,
	onUninstall,
}: ModuleRowProps): JSX.Element {
	const isInstalled = installedVersion !== undefined
	const displayName = module.products?.[0] ?? module.name

	return (
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
			<div className="col-span-3 content-center text-sm flex items-center justify-between">
				<ModuleStatus
					module={module}
					isInstalled={isInstalled}
					installedVersion={installedVersion}
					updateInfo={updateInfo}
					isEnabled={config[module.id] || false}
					operation={operation}
					isOperationInProgress={isOperationInProgress}
					onInstall={() => onInstall(module.id)}
					onUpdate={(version) => onUpdate(module.id, version)}
					onUninstall={(version) => onUninstall(module.id, version)}
				/>
			</div>
		</>
	)
}

export function SurfacePluginsTab(): JSX.Element {
	const api = useSatelliteApi()

	const modulesAvailable = useQuery({
		queryKey: [MODULES_AVAILABLE_QUERY_KEY],
		queryFn: async () => api.modulesAvailable(),
	})

	const modulesInstalled = useQuery({
		queryKey: [MODULES_INSTALLED_QUERY_KEY],
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
	const [operation, setOperation] = useState<OperationState>({ type: null, moduleId: null })

	const isOperationInProgress = operation.type !== null

	const installedMap = new Map(installed.map((m) => [m.id, m]))
	const updatesMap = new Map(updates.map((u) => [u.moduleId, u]))

	const installMutation = useMutation({
		mutationFn: async (moduleId: string) => {
			setOperation({ type: 'installing', moduleId })
			const result = await api.installModule(moduleId)
			if (!result.success) {
				throw new Error(result.error || 'Installation failed')
			}
			return result
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: [MODULES_INSTALLED_QUERY_KEY] })
			await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
		},
		onSettled: () => {
			setOperation({ type: null, moduleId: null })
		},
	})

	const updateMutation = useMutation({
		mutationFn: async ({ moduleId, version }: { moduleId: string; version: string }) => {
			setOperation({ type: 'updating', moduleId })
			const result = await api.installModule(moduleId, version)
			if (!result.success) {
				throw new Error(result.error || 'Update failed')
			}
			return result
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: [MODULES_INSTALLED_QUERY_KEY] })
			await queryClient.invalidateQueries({ queryKey: [MODULES_UPDATES_QUERY_KEY] })
			await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
		},
		onSettled: () => {
			setOperation({ type: null, moduleId: null })
		},
	})

	const uninstallMutation = useMutation({
		mutationFn: async ({ moduleId, version }: { moduleId: string; version: string }) => {
			setOperation({ type: 'uninstalling', moduleId })
			const result = await api.uninstallModule(moduleId, version)
			if (!result.success) {
				throw new Error(result.error || 'Uninstall failed')
			}
			return result
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: [MODULES_INSTALLED_QUERY_KEY] })
			await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
		},
		onSettled: () => {
			setOperation({ type: null, moduleId: null })
		},
	})

	const form = useForm({
		defaultValues: config,
		onSubmit: async ({ value }) => {
			console.log('saving', value)
			const savedData = await api.surfacePluginsEnabledUpdate(value)
			console.log('new', savedData)
			await queryClient.invalidateQueries({ queryKey: [SURFACE_PLUGINS_ENABLED_QUERY_KEY] })
			await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
		},
	})

	const handleInstall = (moduleId: string) => {
		installMutation.mutate(moduleId)
	}

	const handleUpdate = (moduleId: string, version: string) => {
		updateMutation.mutate({ moduleId, version })
	}

	const handleUninstall = (moduleId: string, version: string) => {
		uninstallMutation.mutate({ moduleId, version })
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit().catch((e) => console.error(e))
			}}
		>
			<div className="grid gap-3 grid-cols-6 mt-2">
				{modules.map((module) => (
					<form.Field
						key={module.id}
						name={module.id}
						children={(field) => (
							<ModuleRow
								module={module}
								installedVersion={installedMap.get(module.id)?.version}
								updateInfo={updatesMap.get(module.id)}
								config={config}
								operation={operation}
								isOperationInProgress={isOperationInProgress}
								field={field}
								onInstall={handleInstall}
								onUpdate={handleUpdate}
								onUninstall={handleUninstall}
							/>
						)}
					/>
				))}

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
