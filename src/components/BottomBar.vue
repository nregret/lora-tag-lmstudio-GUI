<script setup lang="ts">
import { Cpu, Database, CheckCircle2 } from 'lucide-vue-next'
import { ref, onMounted } from 'vue'

const gpuInfo = ref('Detecting...')
const ramInfo = ref('...')

function detectGpuRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    if (!gl) return null
    const dbg = gl.getExtension('WEBGL_debug_renderer_info') as any
    if (!dbg) return null
    const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
    return typeof renderer === 'string' && renderer.trim() ? renderer.trim() : null
  } catch {
    return null
  }
}

onMounted(async () => {
  try {
    if (import.meta.env.DEV) {
      const res = await fetch('/api/hwinfo')
      if (res.ok) {
        const data = await res.json()
        gpuInfo.value = data.gpuInfo
        ramInfo.value = data.ramInfo
        return
      }
    }

    const renderer = detectGpuRenderer()
    gpuInfo.value = renderer || 'Unknown GPU'

    const dm = (navigator as any).deviceMemory
    ramInfo.value = typeof dm === 'number' && dm > 0 ? `${dm}GB（估算）` : 'Unknown'
  } catch (e) {
    console.error('Failed to fetch hw info', e)
    gpuInfo.value = 'Unknown GPU'
  }
})
</script>

<template>
  <footer class="bottombar glass-bar">
    <div class="left-stats">
      <div class="stat-item">
        <Cpu :size="14" color="var(--primary)" />
        <span class="label">GPU:</span>
        <span class="value">{{ gpuInfo }} | RAM: {{ ramInfo }}</span>
      </div>
      
      <div class="stat-item">
        <Database :size="14" class="icon-muted" />
        <span class="label">DATASET:</span>
        <span class="value">ANIME_GIRLS_V2 (156)</span>
      </div>
      
      <div class="stat-item success">
        <CheckCircle2 :size="14" />
        <span class="label">WORKERS READY</span>
      </div>
    </div>
    
    <div class="right-links">
      <span class="build-info">BUILD V2.5.0-ULTRA-GLASS</span>
      <a href="#" class="footer-link">DOCS</a>
      <a href="#" class="footer-link">SUPPORT</a>
    </div>
  </footer>
</template>

<style scoped>
.bottombar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 40px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 10px;
  font-weight: 600;
  border-top: 1px solid var(--glass-border-light);
  border-bottom: none;
}

.left-stats {
  display: flex;
  align-items: center;
  gap: 32px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.stat-item .value {
  color: var(--text-main);
  font-weight: 700;
}

.icon-muted {
  color: var(--text-muted);
}

.stat-item.success {
  color: var(--success);
}
.stat-item.success .label {
  color: inherit;
  font-weight: 700;
}

.right-links {
  display: flex;
  align-items: center;
  gap: 24px;
  color: var(--text-light);
  letter-spacing: 1px;
}

.build-info {
  margin-right: 16px;
}

.footer-link {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
}

.footer-link:hover {
  color: var(--text-main);
}
</style>
