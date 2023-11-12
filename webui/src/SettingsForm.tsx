import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import { useFetchInterval } from './Util/useFetchInterval'
import { ApiConfigData } from '../../src/rest'
import { useCallback, useState } from 'react'

const POLL_INTERVAL = 5000

export function SettingsForm() {
	const apiConfig = useFetchInterval<ApiConfigData>(POLL_INTERVAL, '/api/config')
	const [modifiedConfig, setModifiedConfig] = useState<Partial<ApiConfigData>>({})
	const fullModifiedConfig: ApiConfigData | undefined = apiConfig.data
		? { ...apiConfig.data, ...modifiedConfig }
		: undefined

	const saveConfig = useCallback(() => {
		if (fullModifiedConfig) {
			fetch('api/config', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(fullModifiedConfig),
			})
				.then(() => {
					console.log('config saved')
					setModifiedConfig({})
				})
				.catch((e) => {
					console.error('config save failed', e)
				})
		} else {
			console.error('No config loaded to save')
		}
	}, [fullModifiedConfig])

	return (
		<>
			<h3>Settings</h3>
			{fullModifiedConfig ? (
				<SettingsFormInner
					fullConfig={fullModifiedConfig}
					hasChanges={Object.keys(modifiedConfig).length > 0}
					setModifiedConfig={setModifiedConfig}
					saveConfig={saveConfig}
				/>
			) : (
				'Loading...'
			)}
		</>
	)
}

interface SettingsFormInnerProps {
	fullConfig: ApiConfigData
	hasChanges: boolean
	setModifiedConfig: React.Dispatch<React.SetStateAction<Partial<ApiConfigData>>>
	saveConfig: () => void
}
function SettingsFormInner({ fullConfig, hasChanges, setModifiedConfig, saveConfig }: SettingsFormInnerProps) {
	const setHost = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.currentTarget.value

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				host: value,
			}))
		},
		[setModifiedConfig]
	)
	const setPort = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number(e.currentTarget.value)

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				port: value,
			}))
		},
		[setModifiedConfig]
	)

	const saveConfigFull = useCallback(
		(e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault()

			saveConfig()
		},
		[saveConfig]
	)

	return (
		<Form onSubmit={saveConfigFull}>
			<Form.Group className="mb-3" controlId="formCompanionAddress">
				<Form.Label>Companion Address</Form.Label>
				<Form.Control
					type="text"
					placeholder="Companion address (eg 127.0.0.1 or companion.local)"
					value={fullConfig.host}
					onChange={setHost}
				/>
			</Form.Group>

			<Form.Group className="mb-3" controlId="formCompanionPort">
				<Form.Label>Port</Form.Label>
				<Form.Control
					type="number"
					placeholder="16622"
					min={1}
					max={65535}
					value={fullConfig.port}
					onChange={setPort}
				/>
				<Form.Text className="text-muted">
					Only change this if you know what you are doing. In almost all cases this should be left at the default.
				</Form.Text>
			</Form.Group>

			<Button variant="primary" type="submit" disabled={!hasChanges}>
				Save
			</Button>
		</Form>
	)
}
