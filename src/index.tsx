/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import './utils/pollyfills.ts'

import App from './App.tsx'

const root = document.getElementById('root')

render(() => <App />, root!)
