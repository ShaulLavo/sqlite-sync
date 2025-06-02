// pollyfill.ts
// Polyfill Promise.withResolvers
if (typeof Promise.withResolvers === 'undefined') {
	interface WithResolvers<T> {
		promise: Promise<T>
		resolve: (value: T | PromiseLike<T>) => void
		reject: (reason?: unknown) => void
	}

	Promise.withResolvers = <T>(): WithResolvers<T> => {
		let resolve!: (value: T | PromiseLike<T>) => void
		let reject!: (reason?: unknown) => void

		const promise = new Promise<T>((res, rej) => {
			resolve = res
			reject = rej
		})

		return { promise, resolve, reject }
	}
}
