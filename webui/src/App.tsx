import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { SatelliteHeader } from './Header'
import { SettingsForm } from './SettingsForm'
import { ConnectionStatus } from './ConnectionStatus'
import { MyErrorBoundary } from './Util/ErrorBoundary'

function App() {
	return (
		<>
			<SatelliteHeader />
			<Container>
				<Row>
					<Col>
						<MyErrorBoundary>
							<ConnectionStatus />
						</MyErrorBoundary>

						<MyErrorBoundary>
							<SettingsForm />
						</MyErrorBoundary>
					</Col>
				</Row>
			</Container>
		</>
	)
}

export default App
