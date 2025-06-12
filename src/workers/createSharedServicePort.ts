// createSharedServicePort.ts
export function createSharedServicePort<T extends Record<string, any>>(
	target: T
): MessagePort {
	const { port1, port2 } = new MessageChannel()
	port1.addEventListener('message', async ({ data: clientId }) => {
		const { port1: c1, port2: c2 } = new MessageChannel()
		navigator.locks.request(clientId, () => {
			c1.close()
		})
		c1.addEventListener('message', async ({ data }) => {
			const response: any = { nonce: data.nonce }
			try {
				response.result = await target[data.method](...data.args)
			} catch (e) {
				response.error =
					e instanceof Error
						? Object.fromEntries(
								Object.getOwnPropertyNames(e).map(k => [k, (e as any)[k]])
						  )
						: e
			}
			c1.postMessage(response)
		})
		c1.start()
		port1.postMessage(null, [c2])
	})
	port1.start()
	return port2
}
