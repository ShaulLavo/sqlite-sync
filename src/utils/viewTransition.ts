import { batch } from 'solid-js'

const viewTransitionMock: ViewTransition = {
	finished: Promise.resolve(undefined),
	ready: Promise.resolve(undefined),
	skipTransition: () => {},
	updateCallbackDone: Promise.resolve(undefined),
	types: new Set()
}

export const viewTransition = (fn: () => void) => {
	if (!document.startViewTransition) {
		fn()
		return viewTransitionMock
	}
	return document.startViewTransition(fn)
}

export const viewTransitionBatched = (fn: () => void) => {
	return viewTransition(() => batch(fn))
}
