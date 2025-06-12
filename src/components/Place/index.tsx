import { createSignal, createEffect, onMount } from 'solid-js'
import { ColorPicker } from './colorPicker'

const GRID_SIZE = 1000
const DEFAULT_ZOOM = 4
const MIN_ZOOM = 1
const MAX_ZOOM = 40

export default function PlaceCanvas() {
	let canvasRef: HTMLCanvasElement | undefined
	let containerRef: HTMLDivElement | undefined

	const [zoom, setZoom] = createSignal(DEFAULT_ZOOM)
	const [offset, setOffset] = createSignal({ x: 0, y: 0 })
	const [isDragging, setIsDragging] = createSignal(false)
	const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 })
	const [selectedColor, setSelectedColor] = createSignal('#FF4500')
	const [hoveredPixel, setHoveredPixel] = createSignal<{
		x: number
		y: number
	} | null>(null)

	const gridData = new Uint32Array(GRID_SIZE * GRID_SIZE)

	function hexToUint32(hex: string): number {
		const r = Number.parseInt(hex.slice(1, 3), 16)
		const g = Number.parseInt(hex.slice(3, 5), 16)
		const b = Number.parseInt(hex.slice(5, 7), 16)
		return (255 << 24) | (b << 16) | (g << 8) | r
	}

	onMount(() => {
		if (!canvasRef) {
			console.error('Canvas ref not available')
			return
		}

		canvasRef.width = GRID_SIZE
		canvasRef.height = GRID_SIZE

		const ctx = canvasRef.getContext('2d')
		if (!ctx) {
			console.error('Canvas context not available')
			return
		}

		ctx.fillStyle = '#FFFFFF'
		ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE)

		const whiteColor = hexToUint32('#FFFFFF')
		for (let i = 0; i < gridData.length; i++) {
			gridData[i] = whiteColor
		}

		if (containerRef) {
			setOffset({
				x: (containerRef.clientWidth - GRID_SIZE * DEFAULT_ZOOM) / 2,
				y: (containerRef.clientHeight - GRID_SIZE * DEFAULT_ZOOM) / 2
			})
		}

		renderCanvas()
	})

	function renderCanvas() {
		if (!canvasRef) return

		const ctx = canvasRef.getContext('2d')
		if (!ctx) return

		const imageData = ctx.createImageData(GRID_SIZE, GRID_SIZE)
		const data = new Uint32Array(imageData.data.buffer)

		data.set(gridData)

		ctx.putImageData(imageData, 0, 0)

		const hovered = hoveredPixel()
		if (hovered) {
			ctx.strokeStyle = 'black'
			ctx.lineWidth = 10 / zoom()
			ctx.strokeRect(hovered.x, hovered.y, 1, 1)
		}
	}

	function handleCanvasClick(e: MouseEvent) {
		if (!canvasRef) return

		const rect = canvasRef.getBoundingClientRect()
		const x = Math.floor((e.clientX - rect.left) / zoom())
		const y = Math.floor((e.clientY - rect.top) / zoom())

		if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return

		const index = y * GRID_SIZE + x
		gridData[index] = hexToUint32(selectedColor())

		renderCanvas()
	}
	let mouseRenderTimeout: NodeJS.Timeout | undefined
	function handleCanvasMouseMove(e: MouseEvent) {
		if (!canvasRef) return

		const rect = canvasRef.getBoundingClientRect()
		const x = Math.floor((e.clientX - rect.left) / zoom())
		const y = Math.floor((e.clientY - rect.top) / zoom())

		if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
			setHoveredPixel(null)
			return
		}

		setHoveredPixel({ x, y })

		if (mouseRenderTimeout) clearTimeout(mouseRenderTimeout)
		mouseRenderTimeout = setTimeout(() => renderCanvas(), 16) // ~60fps
	}

	function handleCanvasMouseOut() {
		setHoveredPixel(null)
		renderCanvas()
	}

	function handleMouseDown(e: MouseEvent) {
		setIsDragging(true)
		setDragStart({ x: e.clientX, y: e.clientY })
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging()) return

		const dx = e.clientX - dragStart().x
		const dy = e.clientY - dragStart().y

		setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
		setDragStart({ x: e.clientX, y: e.clientY })
	}

	function handleMouseUp() {
		setIsDragging(false)
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault()

		if (!containerRef) return

		const rect = containerRef.getBoundingClientRect()
		const mouseX = e.clientX - rect.left
		const mouseY = e.clientY - rect.top

		const canvasX = (mouseX - offset().x) / zoom()
		const canvasY = (mouseY - offset().y) / zoom()

		const newZoom = Math.max(
			MIN_ZOOM,
			Math.min(MAX_ZOOM, zoom() * (e.deltaY < 0 ? 1.1 : 0.9))
		)

		const newOffsetX = mouseX - canvasX * newZoom
		const newOffsetY = mouseY - canvasY * newZoom

		setZoom(newZoom)
		setOffset({ x: newOffsetX, y: newOffsetY })
	}

	createEffect(() => {
		zoom()
		offset()
		renderCanvas()
	})

	return (
		<div class="w-full h-[calc(100vh-120px)] flex flex-col items-center">
			<div class="flex flex-col w-full h-full">
				<div class="mb-4 flex justify-center">
					<ColorPicker
						selectedColor={selectedColor()}
						onColorChange={setSelectedColor}
					/>
					<div class="ml-4 text-white">
						Zoom: {Math.round(zoom() * 100) / 100}x
					</div>
				</div>
				<div
					ref={containerRef}
					class="relative flex-1 overflow-hidden border border-gray-700 rounded-lg bg-gray-800 cursor-grab active:cursor-grabbing"
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					onWheel={handleWheel}
				>
					<div
						class="absolute"
						style={{
							transform: `translate(${offset().x}px, ${offset().y}px)`,
							width: `${GRID_SIZE * zoom()}px`,
							height: `${GRID_SIZE * zoom()}px`
						}}
					>
						<canvas
							ref={canvasRef}
							onClick={handleCanvasClick}
							onMouseMove={handleCanvasMouseMove}
							onMouseOut={handleCanvasMouseOut}
							style={{
								width: `${GRID_SIZE * zoom()}px`,
								height: `${GRID_SIZE * zoom()}px`,
								'image-rendering': 'pixelated'
							}}
						/>
					</div>
					<div class="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
						1000 x 1000 pixels
					</div>
				</div>
			</div>
		</div>
	)
}
