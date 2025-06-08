export const hasOPFS = async () => {
	if (
		typeof navigator !== 'object' ||
		!navigator.storage ||
		typeof (navigator as any).storage.getDirectory !== 'function'
	) {
		return false
	}

	try {
		await navigator.storage.getDirectory()
		return true
	} catch {
		return false
	}
}
export const isPersisted = async (): Promise<boolean> =>
	!!(navigator.storage && (await navigator.storage.persisted()))
