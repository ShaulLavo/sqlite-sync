import type { Component } from 'solid-js'

interface LogoProps {
	size?: 'sm' | 'md' | 'lg' | 'xl'
	class?: string
}

export const Logo: Component<LogoProps> = props => {
	const sizes = {
		sm: 'h-8',
		md: 'h-10',
		lg: 'h-12',
		xl: 'h-16'
	}

	const sizeClass = sizes[props.size || 'md']

	return (
		<div class={`inline-flex items-center ${props.class || ''}`}>
			<svg
				class={`${sizeClass} w-auto`}
				viewBox="0 0 180 50"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				{/* Gradient definitions */}
				<defs>
					<linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stop-color="#8B5CF6" /> {/* Purple-500 */}
						<stop offset="100%" stop-color="#EC4899" /> {/* Pink-500 */}
					</linearGradient>
					<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
						<feGaussianBlur stdDeviation="2" result="blur" />
						<feComposite in="SourceGraphic" in2="blur" operator="over" />
					</filter>
				</defs>

				{/* Light beam */}
				<path
					d="M25 15L40 30L25 45"
					stroke="url(#logoGradient)"
					stroke-width="4"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="dark:opacity-90"
				/>

				{/* Sync circle */}
				<circle
					cx="25"
					cy="30"
					r="15"
					stroke="url(#logoGradient)"
					stroke-width="4"
					fill="none"
					class="dark:opacity-90"
				/>

				{/* Dot in the middle */}
				<circle
					cx="25"
					cy="30"
					r="5"
					fill="url(#logoGradient)"
					filter="url(#glow)"
					class="dark:opacity-90"
				/>

				{/* Text */}
				<text
					x="55"
					y="35"
					font-family="sans-serif"
					font-weight="bold"
					font-size="24"
					class="fill-gray-800 dark:fill-white"
				>
					<tspan font-weight="800">Lumi</tspan>
					<tspan font-weight="600" class="fill-purple-600 dark:fill-purple-400">
						Sync
					</tspan>
				</text>
			</svg>
		</div>
	)
}
