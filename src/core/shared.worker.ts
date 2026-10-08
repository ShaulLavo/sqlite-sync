import type { DatabaseOptions } from './types'

type Client = { control: MessagePort; options: DatabaseOptions }
const clients = new Map<string, Client>()
const waiting = new Map<string, MessagePort>()
let owner: string | undefined
let ownerPort: MessagePort | undefined
let epoch = 0
let failure: string | undefined

function chooseOwner() {
	if (failure || owner || !clients.size) return
	owner = clients.keys().next().value
	if (owner) clients.get(owner)?.control.postMessage({ type: 'host', epoch })
}

function reconnect() {
	ownerPort?.close()
	ownerPort = undefined
	owner = undefined
	epoch++
	for (const port of waiting.values()) port.close()
	waiting.clear()
	for (const client of clients.values()) client.control.postMessage({ type: 'reconnect', epoch })
	chooseOwner()
}

function attach(sessionId: string, endpoint: MessagePort) {
	const client = clients.get(sessionId)
	if (!client) { endpoint.close(); return }
	if (!ownerPort) { waiting.set(sessionId, endpoint); return }
	ownerPort.postMessage({ type: 'connect', sessionId, options: client.options }, [endpoint])
}

function handleMessage(control: MessagePort, event: MessageEvent) {
	const { data, ports } = event
	if (typeof data?.sessionId !== 'string') return
	const sessionId: string = data.sessionId
	if (data.type === 'connect' && ports[0]) {
		if (failure) { control.postMessage({type:'failure',message:failure}); ports[0].close(); return }
		clients.set(sessionId, { control, options: data.options })
		attach(sessionId, ports[0])
		chooseOwner()
		void navigator.locks.request(sessionId, () => removeClient(sessionId)).catch(() => removeClient(sessionId))
		return
	}
	if (data.epoch !== epoch || clients.get(sessionId)?.control !== control) { ports[0]?.close(); return }
	if (data.type === 'hosted' && sessionId === owner && ports[0]) {
		ownerPort = ports[0]
		ownerPort.start()
		for (const [id, port] of waiting) attach(id, port)
		waiting.clear()
	}
	if (data.type === 'attach' && ports[0]) attach(sessionId, ports[0])
	if (data.type === 'owner-failed' && sessionId === owner) {
		failure = String(data.message || 'Database worker failed')
		for (const client of clients.values()) client.control.postMessage({type:'failure',message:failure})
	}
}

function removeClient(sessionId: string) {
	const client = clients.get(sessionId)
	clients.delete(sessionId)
	if (!clients.size) failure = undefined
	waiting.get(sessionId)?.close()
	waiting.delete(sessionId)
	ownerPort?.postMessage({ type: 'disconnect', sessionId })
	client?.control.close()
	if (sessionId === owner) reconnect()
}

self.addEventListener('connect', (event: MessageEvent) => {
	const control = event.ports[0]
	control.start()
	control.addEventListener('message', event => handleMessage(control, event))
})
