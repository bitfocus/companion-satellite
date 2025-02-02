import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useForm } from '@tanstack/react-form'
import type { ApiConfigData } from '../Api/types.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context.js'
import { Button } from '@/components/ui/button.js'
import { Switch } from '@/components/ui/switch.js'
import React from 'react'
import { CONNECTION_CONFIG_QUERY_KEY, CONNECTION_STATUS_QUERY_KEY } from './constants.js'
import { BarLoader } from 'react-spinners'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js'
import { cn } from '@/lib/utils.js'

export function ConnectionConfig(): JSX.Element {
	const api = useSatelliteApi()
	const config = useQuery({ queryKey: [CONNECTION_CONFIG_QUERY_KEY], queryFn: api.getConfig, refetchInterval: 5000 })

	return (
		<div>
			<h3 className="text-2xl font-bold dark:text-white">Configuration</h3>

			{config.isLoading ? <BarLoader color="#ffffff" className="mt-4" /> : null}
			{config.error ? <p>Error: {config.error.message.toString()}</p> : null}
			{config.data ? <ConnectionConfigContent config={config.data} /> : null}
		</div>
	)
}

function ConnectionConfigContent({ config }: { config: ApiConfigData }): JSX.Element {
	const api = useSatelliteApi()
	const queryClient = useQueryClient()

	const form = useForm<ApiConfigData>({
		defaultValues: config,
		onSubmit: async ({ value }) => {
			// Do something with form data
			console.log('saving', value)

			const savedData = await api.saveConfig(value)

			console.log('new', savedData)
			// TODO - this doesn't work
			// form.reset(savedData)
			await queryClient.invalidateQueries({ queryKey: [CONNECTION_STATUS_QUERY_KEY] })
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
			<div className="grid gap-3 grid-cols-4 mt-2">
				<legend className="col-span-3 col-start-2 px-1">Companion Connection</legend>

				<form.Field
					name="protocol"
					children={(field) => (
						<FormRow label="Protocol" htmlFor={field.name} hint="TCP is recommended for most use cases.">
							<Select value={field.state.value} onValueChange={(value) => field.handleChange(value as 'tcp' | 'ws')}>
								<SelectTrigger id={field.name} name={field.name}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="tcp">TCP (Default)</SelectItem>
									<SelectItem value="ws">WebSocket (Advanced)</SelectItem>
								</SelectContent>
							</Select>
						</FormRow>
					)}
				/>
				<form.Field
					name="host"
					validators={{
						onChangeListenTo: ['protocol'],
					}}
					children={(field) => (
						<FormRow label="Address" htmlFor={field.name} hidden={form.getFieldValue('protocol') !== 'tcp'}>
							<Input
								type="text"
								id={field.name}
								name={field.name}
								placeholder="Companion address (eg 127.0.0.1 or companion.local)"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
						</FormRow>
					)}
				/>
				<form.Field
					name="port"
					validators={{
						onChangeListenTo: ['protocol'],
					}}
					children={(field) => (
						<FormRow
							label="Port"
							htmlFor={field.name}
							hidden={form.getFieldValue('protocol') !== 'tcp'}
							hint="Only change this if you know what you are doing. In almost all cases this should be left at the default."
						>
							<Input
								type="number"
								id={field.name}
								name={field.name}
								placeholder="16622"
								min={1}
								max={65535}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(Number(e.target.value))}
							/>
						</FormRow>
					)}
				/>
				<form.Field
					name="wsAddress"
					validators={{
						onChangeListenTo: ['protocol'],
					}}
					children={(field) => (
						<FormRow
							label="Websocket URL"
							htmlFor={field.name}
							hidden={form.getFieldValue('protocol') !== 'ws'}
							hint="This must be a full URL, eg ws://127.0.0.1:16623"
						>
							<Input
								type="text"
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
						</FormRow>
					)}
				/>

				<hr className="col-span-3 col-start-2" />

				<legend className="col-span-3 col-start-2 px-1">MDNS Discovery</legend>

				<form.Field
					name="mdnsEnabled"
					children={(field) => (
						<FormRow
							label="MDNS Announce"
							htmlFor={field.name}
							hint={
								<>
									Announce this Satellite installation to the network.
									<br />
									This allows for easy setup from inside Companion.
								</>
							}
						>
							<Switch
								id={field.name}
								name={field.name}
								checked={field.state.value}
								onBlur={field.handleBlur}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
						</FormRow>
					)}
				/>
				<form.Field
					name="installationName"
					children={(field) => (
						<FormRow
							label="Installation Name"
							htmlFor={field.name}
							hint="Name to use for this installation in MDNS announcements."
						>
							<Input
								type="text"
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
						</FormRow>
					)}
				/>

				{api.includeApiEnable && (
					<>
						<hr className="col-span-3 col-start-2" />

						<legend className="col-span-3 col-start-2 px-1">HTTP Interface & API</legend>

						<form.Field
							name="httpEnabled"
							children={(field) => (
								<FormRow label="HTTP Enabled" htmlFor={field.name}>
									<Switch
										id={field.name}
										name={field.name}
										checked={field.state.value}
										onBlur={field.handleBlur}
										onCheckedChange={(checked) => field.handleChange(checked)}
									/>
								</FormRow>
							)}
						/>
						<form.Field
							name="httpPort"
							children={(field) => (
								<FormRow label="HTTP Port" htmlFor={field.name}>
									<Input
										type="number"
										id={field.name}
										name={field.name}
										placeholder="9999"
										min={1}
										max={65535}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(Number(e.target.value))}
									/>
								</FormRow>
							)}
						/>
					</>
				)}

				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}
					children={([canSubmit, isSubmitting, isDirty]) => (
						<div className="col-span-3 col-start-2 flex justify-start">
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

function FormRow({
	label,
	htmlFor,
	hint,
	hidden,
	children,
}: {
	label: string
	htmlFor: string
	hint?: string | React.ReactNode
	hidden?: boolean
	children: JSX.Element
}): JSX.Element {
	return (
		<>
			<Label className={cn('text-right content-center', hidden && 'hidden')} htmlFor={htmlFor}>
				{label}
			</Label>
			<div className={cn('col-span-3', hidden && 'hidden')}>{children}</div>
			{hint && (
				<div className={cn('col-span-3 col-start-2 -mt-3', hidden && 'hidden')}>
					<p className="text-sm text-gray-500 p-1">{hint}</p>
				</div>
			)}
		</>
	)
}
