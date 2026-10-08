import type { JSX } from 'solid-js'

export function Icon(props: { name: 'play' | 'pause' | 'step' | 'reset' | 'arrow' | 'database' | 'code' | 'download' | 'external'; size?: number }) {
	const paths: Record<typeof props.name, JSX.Element> = {
		play: <path d="m8 5 11 7-11 7Z" />,
		pause: <><path d="M8 5v14M16 5v14" /></>,
		step: <><path d="m5 5 10 7-10 7Z" /><path d="M19 5v14" /></>,
		reset: <><path d="M3 10a9 9 0 1 1 1 8" /><path d="M3 4v6h6" /></>,
		arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
		database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
		code: <><path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-13-2 20" /></>,
		download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
		external: <><path d="M14 3h7v7m0-7L10 14M11 3H3v18h18v-8" /></>
	}
	return <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[props.name]}</svg>
}
