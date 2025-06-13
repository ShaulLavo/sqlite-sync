import type { Component } from 'solid-js'

interface AppIconProps {
	size?: number
	class?: string
}

export const AppIcon: Component<AppIconProps> = props => {
	const size = props.size || 50

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 50 50"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			class={props.class}
		>
			<defs>
				<linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stop-color="#8B5CF6" /> {/* Purple-500 */}
					<stop offset="100%" color="#EC4899" /> {/* Pink-500 */}
				</linearGradient>
				<filter id="iconGlow" x="-20%" y="-20%" width="140%" height="140%">
					<feGaussianBlur stdDeviation="2" result="blur" />
					<feComposite in="SourceGraphic" in2="blur" operator="over" />
				</filter>
			</defs>

			{/* Background circle */}
			<circle
				cx="25"
				cy="25"
				r="23"
				fill="#ffffff"
				class="dark:fill-gray-800"
			/>

			{/* Light beam */}
			<path
				d="M15 10L30 25L15 40"
				stroke="url(#iconGradient)"
				stroke-width="4"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			{/* Sync circle */}
			<circle
				cx="15"
				cy="25"
				r="10"
				stroke="url(#iconGradient)"
				stroke-width="4"
				fill="none"
			/>

			{/* Dot in the middle */}
			<circle
				cx="15"
				cy="25"
				r="3"
				fill="url(#iconGradient)"
				filter="url(#iconGlow)"
			/>
		</svg>
	)
}
