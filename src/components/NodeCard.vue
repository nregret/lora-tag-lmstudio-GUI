<script setup lang="ts">
import { MoreVertical} from 'lucide-vue-next'

defineProps<{
  title: string
  isActive?: boolean
  subtitle?: string
}>()
</script>

<template>
  <div class="node-card glass-panel" :class="{ active: isActive }">
    <div class="node-header">
      <div class="header-left">
        <div class="status-dot" :class="{ active: isActive }"></div>
        <span class="title">{{ title }}</span>
        <span class="subtitle" v-if="subtitle">{{ subtitle }}</span>
      </div>
      <button class="icon-btn">
        <MoreVertical :size="14" />
      </button>
    </div>
    
    <div class="node-content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.node-card {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--glass-shadow-md);
  transition: box-shadow 0.2s, transform 0.2s, background-color var(--theme-ease), border-color var(--theme-ease);
  cursor: grab;
  /* Override panel opacity for nodes to be slightly more solid but still glassy */
  background: var(--ui-control-bg);
  backdrop-filter: var(--blur-md);
  -webkit-backdrop-filter: var(--blur-md);
  border: 1px solid var(--glass-border-light);
}

.node-card:active {
  cursor: grabbing;
}

.node-card:hover {
  box-shadow: var(--glass-shadow-lg);
  transform: translateY(-2px);
}

.node-card.active {
  border: 1px solid rgba(46, 182, 255, 0.4);
  box-shadow: 0 8px 32px rgba(46, 182, 255, 0.15);
}

.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--glass-border-dark);
  background: var(--ui-control-bg-soft);
  transition: background-color var(--theme-ease), border-color var(--theme-ease);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-light);
}

.status-dot.active {
  background: var(--primary);
  box-shadow: 0 0 8px var(--primary);
}

.title {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-muted);
}

.active .title {
  color: var(--primary);
}

.subtitle {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 9px;
  color: var(--text-light);
  margin-left: auto;
}

.icon-btn {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  color: var(--text-main);
}

.node-content {
  padding: 16px;
}
</style>
