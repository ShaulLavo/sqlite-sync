import type { Api } from '../sqlite'

/**
 * Helper function to download the local database file.
 * Gets the blob from the worker and triggers download using DOM APIs.
 */
export async function downloadDatabase(api: Api): Promise<void> {
	try {
		const blob = await api.downloadLocalDB()

		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'local.db'
		document.body.appendChild(a)
		a.click()
		a.remove()

		URL.revokeObjectURL(url)
	} catch (error) {
		console.error('Failed to download database:', error)
		throw error
	}
}
