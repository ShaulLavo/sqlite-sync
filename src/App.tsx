import { Route, Router } from '@solidjs/router'
import type { Component, ParentComponent } from 'solid-js'
import { DbProvider } from './context/DbProvider'
import Home from './routes/Home'
import { ChangeLogTable } from './components/ChangeLog'
import { Data } from './components/Data'
import PlaceCanvas from './components/Place'

const Layout: ParentComponent = props => {
	return <DbProvider>{props.children}</DbProvider>
}

const App: Component = () => {
	return (
		<Router root={Layout}>
			<Route path="/" component={Home} />
			<Route path="/changelog" component={ChangeLogTable} />
			<Route path="/info" component={Data} />

			<Route path="/place" component={PlaceCanvas} />
		</Router>
	)
}

export default App
