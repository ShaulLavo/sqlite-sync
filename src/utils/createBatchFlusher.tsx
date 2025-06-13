export function createBatchFlusher<T>(
	sendFn: (items: T[]) => Promise<any>,
	maxDelay = 5000
): (items: T[]) => void {
	let buffer: T[] = []
	let timer: ReturnType<typeof setTimeout> | null = null
	let inFlight = false
	let pending = false

	async function flush() {
		if (inFlight) {
			pending = true
			return
		}

		if (buffer.length === 0) {
			timer = null
			return
		}

		inFlight = true
		const itemsToSend = buffer
		buffer = []
		timer = null

		try {
			await sendFn(itemsToSend)
		} catch (error) {
			console.error('Batch flush failed, retrying:', error)

			buffer = itemsToSend.concat(buffer)
		} finally {
			inFlight = false

			if (pending) {
				pending = false
				flush()
			}
		}
	}

	return (items: T[]) => {
		if (items.length === 0) return
		buffer.push(...items)
		if (!timer) {
			timer = setTimeout(flush, maxDelay)
		}
	}
}

export function chainify<Args extends unknown[], R>(
	fn: (...args: Args) => R | Promise<R>
): (...args: Args) => Promise<R> {
	let last: Promise<unknown> = Promise.resolve()

	return (...args: Args): Promise<R> => {
		const result = last.then(
			() => fn(...args),
			() => fn(...args)
		) as Promise<R>

		last = result.catch(e => console.log('error during func chain', e))

		return result
	}
}
