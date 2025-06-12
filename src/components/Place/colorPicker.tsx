import { createSignal } from 'solid-js'

// Common r/place colors
const COLORS = [
	'#FF4500', // Reddit Orange
	'#FFA800', // Orange
	'#FFD635', // Yellow
	'#00A368', // Green
	'#7EED56', // Light Green
	'#2450A4', // Blue
	'#3690EA', // Light Blue
	'#51E9F4', // Cyan
	'#811E9F', // Purple
	'#B44AC0', // Light Purple
	'#FF99AA', // Pink
	'#9C6926', // Brown
	'#000000', // Black
	'#898D90', // Gray
	'#D4D7D9', // Light Gray
	'#FFFFFF' // White
]

interface ColorPickerProps {
	selectedColor: string
	onColorChange: (color: string) => void
}

export function ColorPicker(props: ColorPickerProps) {
	const [showCustom, setShowCustom] = createSignal(false)
	const [customColor, setCustomColor] = createSignal('#000000')

	function handleCustomColorChange(e: Event) {
		const input = e.target as HTMLInputElement
		setCustomColor(input.value)
	}

	function applyCustomColor() {
		props.onColorChange(customColor())
		setShowCustom(false)
	}

	return (
		<div class="flex flex-col items-center">
			<div class="flex flex-wrap gap-2 mb-2 p-2 bg-gray-800 rounded-lg border border-gray-700 max-w-md">
				{COLORS.map(color => (
					<button
						class={`w-8 h-8 rounded-md ${
							props.selectedColor === color
								? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800'
								: ''
						}`}
						style={{ 'background-color': color }}
						onClick={() => props.onColorChange(color)}
						aria-label={`Select color ${color}`}
					/>
				))}
				<button
					class="w-8 h-8 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold"
					onClick={() => setShowCustom(!showCustom())}
					aria-label="Custom color"
				>
					+
				</button>
			</div>

			{showCustom() && (
				<div class="flex items-center gap-2 p-2 bg-gray-800 rounded-lg border border-gray-700">
					<input
						type="color"
						value={customColor()}
						onInput={handleCustomColorChange}
						class="w-8 h-8 rounded cursor-pointer"
					/>
					<input
						type="text"
						value={customColor()}
						onInput={e => setCustomColor((e.target as HTMLInputElement).value)}
						class="bg-gray-700 text-white px-2 py-1 rounded w-24"
					/>
					<button
						onClick={applyCustomColor}
						class="bg-blue-600 text-white px-2 py-1 rounded"
					>
						Apply
					</button>
				</div>
			)}

			<div class="mt-2 flex items-center gap-2">
				<div class="text-white">Selected:</div>
				<div
					class="w-6 h-6 rounded-md"
					style={{ 'background-color': props.selectedColor }}
				/>
				<div class="text-white">{props.selectedColor}</div>
			</div>
		</div>
	)
}
