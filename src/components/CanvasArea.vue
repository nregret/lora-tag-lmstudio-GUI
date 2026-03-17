<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { CloudUpload, LayoutGrid } from 'lucide-vue-next'
import NodeCard from './NodeCard.vue'

import { nodes, activeNodeIds, currentDirectoryHandle } from '../store'
import type { NodeData } from '../store'

// --- Canvas State ---
const transform = ref({ x: 0, y: 0, scale: 1 })
const isPanning = ref(false)
const lastPoint = ref({ x: 0, y: 0 })
const hasMovedSinceDown = ref(false)

// --- Selection State ---
const isBoxSelecting = ref(false)
const selectionStart = ref({ x: 0, y: 0 })
const selectionBox = ref({ x: 0, y: 0, width: 0, height: 0 })

// --- Nodes State ---
const draggingNodeId = ref<number | null>(null)
const draggingNodeInfo = ref<NodeData | null>(null)
const activeResizeNodeId = ref<number | null>(null)
const activeResizeNodeInfo = ref<NodeData | null>(null)
const initialResize = ref({ width: 0, x: 0 })

// --- Canvas Interactions ---
const zoomIn = () => setScale(transform.value.scale * 1.2, window.innerWidth/2, window.innerHeight/2)
const zoomOut = () => setScale(transform.value.scale / 1.2, window.innerWidth/2, window.innerHeight/2)
const resetView = () => {
  transform.value = { x: 0, y: 0, scale: 1 }
}

const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  const zoomFactor = 1.1
  const scaleChange = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor
  const newScale = transform.value.scale * scaleChange
  
  setScale(newScale, e.clientX, e.clientY)
}

const setScale = (newScale: number, originX: number, originY: number) => {
  newScale = Math.min(Math.max(newScale, 0.1), 5)
  const actualScaleChange = newScale / transform.value.scale
  
  transform.value.x = originX - (originX - transform.value.x) * actualScaleChange
  transform.value.y = originY - (originY - transform.value.y) * actualScaleChange
  transform.value.scale = newScale
}

const onPointerDownCanvas = (e: PointerEvent) => {
  // Middle click simply pans
  if (e.button === 1) {
    isPanning.value = true
    hasMovedSinceDown.value = false
    lastPoint.value = { x: e.clientX, y: e.clientY }
    document.body.style.cursor = 'grabbing'
    return
  }
  
  // Left click on empty space: Start box selection or deselect
  if (e.button === 0) {
    hasMovedSinceDown.value = false
    
    // Start drawing selection box
    isBoxSelecting.value = true
    const startX = (e.clientX - transform.value.x) / transform.value.scale
    const startY = (e.clientY - transform.value.y) / transform.value.scale
    selectionStart.value = { x: startX, y: startY }
    selectionBox.value = { x: startX, y: startY, width: 0, height: 0 }
    
    // Deselect if ctrl is NOT pressed
    if (!e.ctrlKey && !e.metaKey) {
      activeNodeIds.value = []
    }
  }
}

// --- Node Interactions ---
const onPointerDownNode = (e: PointerEvent, nodeId: number) => {
  if (e.button === 1) {
    isPanning.value = true
    hasMovedSinceDown.value = false
    lastPoint.value = { x: e.clientX, y: e.clientY }
    document.body.style.cursor = 'grabbing'
    return
  }

  // Ctrl+Click handling
  if (e.ctrlKey || e.metaKey) {
    hasMovedSinceDown.value = false
    if (activeNodeIds.value.includes(nodeId)) {
      activeNodeIds.value = activeNodeIds.value.filter(id => id !== nodeId)
    } else {
      activeNodeIds.value.push(nodeId)
    }
    return
  }

  // Normal click
  if (!activeNodeIds.value.includes(nodeId)) {
    activeNodeIds.value = [nodeId]
  }

  if (e.button === 0) {
    draggingNodeId.value = nodeId
    draggingNodeInfo.value = nodes.value.find(n => n.id === nodeId) || null
    hasMovedSinceDown.value = false
  }
}

const startResize = (e: PointerEvent, node: NodeData) => {
  activeNodeIds.value = [node.id]
  activeResizeNodeId.value = node.id
  activeResizeNodeInfo.value = node
  initialResize.value = { width: node.width, x: e.clientX }
  hasMovedSinceDown.value = false
}

// --- File Upload ---
const triggerUpload = async () => {
  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    currentDirectoryHandle.value = dirHandle
    
    // Scan all files in the directory
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.match(/\.(jpg|jpeg|png|webp|bmp)$/i)) {
        const file = await entry.getFile()
        const url = URL.createObjectURL(file)
        
        await new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            const aspectRatio = img.width / img.height
            const initWidth = 280
            
            nodes.value.push({
              id: Date.now() + Math.random(),
              title: entry.name.toUpperCase(),
              baseName: entry.name.replace(/\.[^/.]+$/, ""),
              x: 0,
              y: 0,
              width: initWidth,
              aspectRatio,
              imageUrl: url
            })
            resolve()
          }
          img.src = url
        })
      }
    }
    
    // Automatically arrange nodes after loading them
    arrangeNodes()
    
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error(err)
    }
  }
}

// --- Layout Tools ---
const arrangeNodes = () => {
  if (nodes.value.length === 0) return

  const margin = 40
  const cols = Math.ceil(Math.sqrt(nodes.value.length))
  let currentX = 0
  let currentY = 0
  let rowMaxHeight = 0
  
  // Starting point relative to view center roughly
  const startX = -transform.value.x / transform.value.scale + window.innerWidth / 4
  const startY = -transform.value.y / transform.value.scale + window.innerHeight / 4
  
  nodes.value.forEach((node, index) => {
    // Determine target dimensions
    const h = node.width / node.aspectRatio
    
    node.x = startX + currentX
    node.y = startY + currentY
    
    currentX += node.width + margin
    rowMaxHeight = Math.max(rowMaxHeight, h)
    
    // Wrap to next row
    if ((index + 1) % cols === 0) {
      currentX = 0
      currentY += rowMaxHeight + margin
      rowMaxHeight = 0
    }
  })
}

// --- Global Pointer Events ---

const onPointerMove = (e: PointerEvent) => {
  if (isPanning.value || isBoxSelecting.value || draggingNodeId.value !== null || activeResizeNodeId.value !== null) {
    if (Math.abs(e.movementX) > 0 || Math.abs(e.movementY) > 0) {
      hasMovedSinceDown.value = true
    }
  }

  if (isBoxSelecting.value) {
    const currentX = (e.clientX - transform.value.x) / transform.value.scale
    const currentY = (e.clientY - transform.value.y) / transform.value.scale
    
    selectionBox.value = {
      x: Math.min(selectionStart.value.x, currentX),
      y: Math.min(selectionStart.value.y, currentY),
      width: Math.abs(currentX - selectionStart.value.x),
      height: Math.abs(currentY - selectionStart.value.y)
    }
  } else if (isPanning.value) {
    transform.value.x += e.movementX
    transform.value.y += e.movementY
  } else if (activeResizeNodeId.value !== null && activeResizeNodeInfo.value) {
    const deltaX = (e.clientX - initialResize.value.x) / transform.value.scale
    activeResizeNodeInfo.value.width = Math.max(150, initialResize.value.width + deltaX) // Min width 150
  } else if (draggingNodeId.value !== null && draggingNodeInfo.value) {
    // Determine the active nodes being dragged
    const dragNodes = nodes.value.filter(n => activeNodeIds.value.includes(n.id))
    dragNodes.forEach(n => {
      n.x += e.movementX / transform.value.scale
      n.y += e.movementY / transform.value.scale
    })
  }
}

const onPointerUp = (e: PointerEvent) => {
  if (isBoxSelecting.value) {
    // If we drew a box and moved, calculate collision
    if (hasMovedSinceDown.value) {
      const box = selectionBox.value
      // Base logic: find nodes overlapping with the box
      const newlySelected = nodes.value.filter(n => {
        const h = n.width / n.aspectRatio
        return !(n.x > box.x + box.width || 
                 n.x + n.width < box.x || 
                 n.y > box.y + box.height || 
                 n.y + h < box.y)
      }).map(n => n.id)

      if (e.ctrlKey || e.metaKey) {
        // Toggle selection for inside items
        newlySelected.forEach(id => {
          if (!activeNodeIds.value.includes(id)) {
            activeNodeIds.value.push(id)
          } 
        })
      } else {
        activeNodeIds.value = newlySelected
      }
    } else if (!e.ctrlKey && !e.metaKey && e.button === 0) {
      // Simple click on canvas (not dragging box)
      activeNodeIds.value = []
    }
    isBoxSelecting.value = false
  }

  isPanning.value = false
  draggingNodeId.value = null
  draggingNodeInfo.value = null
  activeResizeNodeId.value = null
  activeResizeNodeInfo.value = null
  document.body.style.cursor = 'default'
}

const onKeyDown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (activeNodeIds.value.length > 0) {
      nodes.value = nodes.value.filter(n => !activeNodeIds.value.includes(n.id))
      activeNodeIds.value = []
    }
  }
}

// --- Computed Styles ---
const canvasContentStyle = computed(() => ({
  transform: `translate(${transform.value.x}px, ${transform.value.y}px) scale(${transform.value.scale})`,
  transformOrigin: '0 0'
}))

const gridStyle = computed(() => {
  // To keep the grid crisp, we adjust background-size and position
  const scaledSize = 40 * transform.value.scale
  return {
    backgroundSize: `${scaledSize}px ${scaledSize}px`,
    backgroundPosition: `${transform.value.x}px ${transform.value.y}px`
  }
})

// --- Lifecycle ---
onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousedown', (e) => {
    // Prevent middle-click auto-scroll on Windows
    if (e.button === 1) e.preventDefault()
  }, { passive: false })
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <main class="canvas-area" @wheel.passive="false" @wheel="onWheel" @pointerdown="onPointerDownCanvas">
    <div class="grid-background" :style="gridStyle"></div>
    
    <div class="canvas-content" :style="canvasContentStyle">
      <div 
        v-for="node in nodes" 
        :key="node.id"
        class="node-wrapper" 
        :style="{ transform: `translate(${node.x}px, ${node.y}px)`, width: node.width + 'px' }"
        @pointerdown.stop="onPointerDownNode($event, node.id)"
      >
        <NodeCard :title="node.title" :isActive="activeNodeIds.includes(node.id)">
          <div 
            class="user-image" 
            :style="{ 
              backgroundImage: `url(${node.imageUrl})`, 
              height: (node.width / node.aspectRatio) + 'px' 
            }">
          </div>
        </NodeCard>
        
        <!-- Resize Handle (bottom right) -->
        <div class="resize-handle" v-if="activeNodeIds.length <= 1" @pointerdown.stop="startResize($event, node)"></div>
      </div>
      
      <!-- Selection Box UI -->
      <div 
        v-if="isBoxSelecting && hasMovedSinceDown" 
        class="selection-box"
        :style="{
          left: selectionBox.x + 'px',
          top: selectionBox.y + 'px',
          width: selectionBox.width + 'px',
          height: selectionBox.height + 'px'
        }"
      ></div>
    </div>

    <!-- Zoom controls UI (Fixed on screen) -->
    <div class="canvas-controls glass-card">
      <button class="control-btn" @click.stop="zoomIn">+</button>
      <div class="divider"></div>
      <button class="control-btn" @click.stop="zoomOut">-</button>
      <div class="divider-horizontal"></div>
      <button class="control-btn" @click.stop="resetView">⛶</button>
      <div class="divider"></div>
      <button class="control-btn" @click.stop="arrangeNodes" title="Arrange Tags (Grid)">
        <LayoutGrid :size="16" />
      </button>
    </div>

    <!-- Floating Drop Zone hovering above the bottom bar -->
    <div class="floating-drop-zone glass-card" @click.stop="triggerUpload">
      <CloudUpload :size="18" class="icon" color="var(--primary)" />
      <span>上传你的图片文件夹</span>
    </div>
  </main>
</template>

<style scoped>
.canvas-area {
  background-color: var(--bg-color);
  overflow: hidden;
  position: relative;
  width: 100%;
  height: 100%;
  user-select: none;
}

.grid-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-image:
    linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
  z-index: 0;
}

.canvas-area::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 100px rgba(0,0,0,0.02);
  pointer-events: none;
  z-index: 1;
}

.canvas-content {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 10;
  pointer-events: none; /* Let clicks pass through empty space */
}

/* UI Elements Overlay */
.canvas-controls {
  position: absolute;
  left: 24px;
  top: 88px;
  display: flex;
  flex-direction: column;
  z-index: 20;
  padding: 4px;
}

.control-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--text-muted);
  border-radius: 8px;
  transition: all 0.2s;
}

.control-btn:hover {
  background: var(--ui-hover-bg);
  color: var(--text-main);
}

.divider {
  height: 1px;
  background: var(--glass-border-dark);
  margin: 4px;
}
.divider-horizontal {
  height: 8px;
  margin: 0;
  background: transparent;
}

/* Node Styles */
.node-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: auto; /* Re-enable interaction for nodes */
  will-change: transform;
}

.user-image {
  width: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 6px;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.1);
  display: block; /* ensure no extra space below */
}

/* Resize Handle */
.resize-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  z-index: 20;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 2px var(--ui-handle-ring), 0 2px 6px rgba(0,0,0,0.18);
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
}

.node-wrapper:hover .resize-handle {
  opacity: 1;
}

.resize-handle:hover {
  transform: scale(1.2);
}

/* Floating Drop Zone */
.floating-drop-zone {
  position: absolute;
  left: calc((100vw - 460px) / 2 - 200px);
  bottom: 80px; 
  width: 400px;
  height: 60px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--ui-panel-strong-bg);
  border: 1px solid var(--glass-border-light);
  box-shadow: var(--glass-shadow-lg);
  backdrop-filter: var(--blur-lg);
  color: var(--text-main);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  cursor: pointer;
  z-index: 20;
  transition: transform 0.2s, box-shadow 0.2s, background-color var(--theme-ease), border-color var(--theme-ease), color var(--theme-ease);
}

.floating-drop-zone:hover {
  background: var(--ui-solid-bg);
  transform: translateY(-2px);
  box-shadow: var(--glass-shadow-lg);
}

.floating-drop-zone .icon {
  background: rgba(46, 182, 255, 0.15);
  padding: 6px;
  border-radius: 50%;
  width: 32px;
  height: 32px;
}

/* Selection Box */
.selection-box {
  position: absolute;
  border: 1px solid var(--primary);
  background-color: rgba(46, 182, 255, 0.15);
  pointer-events: none;
  z-index: 50;
  border-radius: 4px;
}
</style>
