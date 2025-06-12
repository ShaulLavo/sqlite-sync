// Button.tsx
import { splitProps } from 'solid-js'
import type { JSX } from 'solid-js/jsx-runtime'

export interface ButtonProps
	extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
	class?: string
	children?: JSX.Element
}

export default function Button(props: ButtonProps) {
	const [local, others] = splitProps(props, ['class', 'children'])

	return (
		<button
			class={`px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors duration-200 shadow-md text-base leading-relaxed mb-6 ${
				local.class ?? ''
			}`}
			{...others}
		>
			{local.children}
		</button>
	)
}
