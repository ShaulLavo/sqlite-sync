import { Route, Router } from '@solidjs/router'
import Playground from './demo/Playground'
import PlaceCanvas from './components/Place'

export default function App() {
	return <Router><Route path="/" component={Playground} /><Route path="/info" component={Playground} /><Route path="/changelog" component={Playground} /><Route path="/place" component={PlaceCanvas} /></Router>
}
