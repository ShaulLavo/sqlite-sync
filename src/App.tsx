import { Route, Router } from '@solidjs/router'
import Playground from './demo/Playground'
import PlaceCanvas from './components/Place'

export default function App() {
	return <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Route path="/" component={Playground} /><Route path="/place" component={PlaceCanvas} /></Router>
}
