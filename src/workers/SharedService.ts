// SharedService.ts
const PROVIDER_REQUEST_TIMEOUT = 1000

const DEFAULT_SHARED_WORKER_PATH = new URL(
	'./sharedServiceSharedWorker.ts',
	import.meta.url
)

const sharedWorker = globalThis.SharedWorker
	? new SharedWorker(DEFAULT_SHARED_WORKER_PATH)
	: null

type ServiceMethodCall<Service, K extends keyof Service> = Service[K] extends (
	...args: infer A
) => infer R
	? (...args: A) => Promise<R>
	: never

export class SharedService<
	Service extends Record<string, any>
> extends EventTarget {
	#serviceName: string
	#clientId: Promise<string>
	#portProviderFunc: () => MessagePort | Promise<MessagePort>
	#clientChannel = new BroadcastChannel('SharedService')
	#onDeactivate: AbortController | null = null
	#onClose = new AbortController()
	#providerPort: Promise<MessagePort | null>
	providerCallbacks = new Map<
		string,
		{ resolve: (value: any) => void; reject: (reason?: any) => void }
	>()
	#providerCounter = 0
	#providerChangeCleanup: Array<() => void> = []

	public readonly proxy: { [K in keyof Service]: ServiceMethodCall<Service, K> }

	constructor(
		serviceName: string,
		portProviderFunc: () => MessagePort | Promise<MessagePort>
	) {
		super()
		this.#serviceName = serviceName
		this.#portProviderFunc = portProviderFunc
		this.#clientId = this.#getClientId()
		this.#providerPort = this.#listenForProviderChanges()
		this.#clientChannel.addEventListener(
			'message',
			({ data }) => {
				if (
					data?.type === 'provider' &&
					data.sharedService === this.#serviceName
				) {
					this.#closeProviderPort(this.#providerPort)
					this.#providerPort = this.#listenForProviderChanges()
				}
			},
			{ signal: this.#onClose.signal }
		)
		this.proxy = this.#createProxy()
	}

	activate(): void {
		if (this.#onDeactivate) return
		this.#onDeactivate = new AbortController()

		navigator.locks.request(
			`SharedService-${this.#serviceName}`,
			{ signal: this.#onDeactivate.signal },
			async () => {
				const port = await this.#portProviderFunc()
				port.start()

				const providerId = await this.#clientId
				const bc = new BroadcastChannel('SharedService')
				bc.addEventListener(
					'message',
					async ({ data }) => {
						if (
							data?.type === 'request' &&
							data.sharedService === this.#serviceName
						) {
							const requestedPort = await new Promise<MessagePort>(resolve => {
								port.addEventListener('message', e => resolve(e.ports[0]), {
									once: true
								})
								port.postMessage(data.clientId)
							})
							this.#sendPortToClient(data, requestedPort)
						}
					},
					{ signal: this.#onDeactivate?.signal }
				)

				bc.postMessage({
					type: 'provider',
					sharedService: this.#serviceName,
					providerId
				})

				return new Promise<void>((_, reject) => {
					this.#onDeactivate!.signal.addEventListener('abort', () => {
						bc.close()
						reject(this.#onDeactivate!.signal.reason)
					})
				})
			}
		)
	}

	deactivate(): void {
		this.#onDeactivate?.abort()
		this.#onDeactivate = null
	}

	close(): void {
		this.deactivate()
		this.#onClose.abort()
		for (const { reject } of this.providerCallbacks.values()) {
			reject(new Error('SharedService closed'))
		}
	}

	async #sendPortToClient(message: any, port: MessagePort): Promise<void> {
		sharedWorker?.port.postMessage(message, [port])
	}

	async #getClientId(): Promise<string> {
		const nonce = Math.random().toString()
		const clientId = await navigator.locks.request(nonce, async () => {
			const { held } = await navigator.locks.query()
			return held?.find(lock => lock.name === nonce)?.clientId! ?? ''
		})
		await SharedService.#acquireContextLock(clientId)

		sharedWorker?.port.addEventListener('message', event => {
			event.data.ports = event.ports
			this.dispatchEvent(new MessageEvent('message', { data: event.data }))
		})
		sharedWorker?.port.start()
		sharedWorker?.port.postMessage({ clientId })

		return clientId
	}

	async #listenForProviderChanges(): Promise<MessagePort | null> {
		const myCounter = ++this.#providerCounter
		const clientId = await this.#clientId
		let providerPort: MessagePort | null = null

		while (!providerPort && myCounter === this.#providerCounter) {
			const nonce = Math.random().toString(36).slice(2)
			this.#clientChannel.postMessage({
				type: 'request',
				nonce,
				sharedService: this.#serviceName,
				clientId
			})

			const providerPortReady = new Promise<MessagePort>(resolve => {
				const ac = new AbortController()
				this.addEventListener(
					'message',
					(ev: any) => {
						if (ev.data?.nonce === nonce) {
							resolve(ev.data.ports[0])
							ac.abort()
						}
					},
					{ signal: ac.signal }
				)
				this.#providerChangeCleanup.push(() => ac.abort())
			})

			providerPort = await Promise.race([
				providerPortReady,
				new Promise<null>(res =>
					setTimeout(() => res(null), PROVIDER_REQUEST_TIMEOUT)
				)
			])

			if (!providerPort) {
				providerPortReady.then(p => p.close())
			}
		}

		if (providerPort && myCounter === this.#providerCounter) {
			this.#providerChangeCleanup.forEach(fn => fn())
			this.#providerChangeCleanup = []
			providerPort.addEventListener('message', ({ data }) => {
				const cb = this.providerCallbacks.get(data.nonce)!
				if (!data.error) cb.resolve(data.result)
				else cb.reject(Object.assign(new Error(), data.error))
			})
			providerPort.start()
			return providerPort
		} else {
			providerPort?.close()
			return null
		}
	}

	#closeProviderPort(p: Promise<MessagePort | null>) {
		p.then(port => port?.close())
		for (const { reject } of this.providerCallbacks.values()) {
			reject(new Error('SharedService provider change'))
		}
	}

	#createProxy(): {
		[K in keyof Service]: ServiceMethodCall<Service, K>
	} {
		return new Proxy(
			{},
			{
				get:
					(_, method: string) =>
					async (...args: any[]) => {
						const nonce = Math.random().toString(36).slice(2)
						const port = await this.#providerPort
						return new Promise<any>((resolve, reject) => {
							this.providerCallbacks.set(nonce, { resolve, reject })
							port?.postMessage({ nonce, method, args })
						}).finally(() => {
							this.providerCallbacks.delete(nonce)
						})
					}
			}
		) as any
	}

	static #acquireContextLock = (() => {
		let p: Promise<void> | null = null
		return (clientId: string) =>
			p ||
			(p = new Promise(resolve => {
				navigator.locks.request(clientId, () => new Promise(() => resolve()))
			}))
	})()
}
