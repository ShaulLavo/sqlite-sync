import { type Component, type JSX, splitProps } from 'solid-js'

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'default' | 'outline' | 'ghost'
	size?: 'sm' | 'md' | 'lg'
	class?: string
	children?: JSX.Element
}

const Button: Component<ButtonProps> = props => {
	const [local, others] = splitProps(props, [
		'variant',
		'size',
		'class',
		'children',
		'disabled'
	])

	// Base classes from original button
	const baseClasses =
		'px-4 py-2 rounded transition-colors duration-200 shadow-md text-base leading-relaxed'

	// Size classes
	const sizeClasses = {
		sm: 'px-3 py-1 text-sm',
		md: 'px-4 py-2',
		lg: 'px-6 py-3 text-lg'
	}

	// Variant classes - keeping original as default
	const variantClasses = {
		default: 'bg-black text-white hover:bg-gray-800',
		outline:
			'border border-black bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-black dark:text-white dark:border-gray-600',
		ghost:
			'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-black dark:text-white'
	}

	// Disabled state
	const disabledClasses = () =>
		local.disabled ? 'opacity-50 cursor-not-allowed' : ''

	return (
		<button
			class={[
				baseClasses,
				sizeClasses[local.size || 'md'],
				variantClasses[local.variant || 'default'],
				disabledClasses(),
				local.class || ''
			].join(' ')}
			disabled={local.disabled}
			{...others}
		>
			{local.children}
		</button>
	)
}

export default Button
