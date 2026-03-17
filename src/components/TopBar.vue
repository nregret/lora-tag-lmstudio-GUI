<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import { Hexagon, Cloud, Moon, Sun, Settings, Monitor, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import {
  isLocalApi,
  isDarkMode,
  taggingProgress,
  localApiBaseUrl,
  localApiModel,
  localApiKey,
  cloudApiBaseUrl,
  cloudApiModel,
  cloudApiKey
} from '../store'

const showApiModal = ref(false)
const activeApiTab = ref<'local' | 'cloud'>('local')

const syncLabel = computed(() => (isLocalApi.value ? '本地 API' : '云端 API'))
const syncHint = computed(() => (isLocalApi.value ? '点击切换到云端 API' : '点击切换到本地 API'))
const themeHint = computed(() => (isDarkMode.value ? '切换到浅色模式' : '切换到夜间模式'))

const openApiModal = (tab: 'local' | 'cloud') => {
  activeApiTab.value = tab
  showApiModal.value = true
}
</script>

<template>
  <div class="topbar-root" v-bind="$attrs">
    <header class="topbar glass-bar">
      <!-- Left: Logo -->
      <div class="logo">
        <div class="logo-icon">
          <Hexagon :size="20" color="var(--primary)" />
        </div>
        <span class="logo-text">TagMaster Pro</span>
      </div>
  
      <!-- Center: Navigation -->
      <nav class="nav-links">
        <a href="#" class="nav-item">PROJECTS</a>
        <a href="#" class="nav-item active">DATASET</a>
        <a href="#" class="nav-item">TRAINING</a>
        <a href="#" class="nav-item">NODES</a>
      </nav>

      <!-- Right: Actions -->
      <div class="actions">
        <button
          class="sync-badge"
          type="button"
          :title="syncHint"
          @click="isLocalApi = !isLocalApi"
          @contextmenu.prevent="openApiModal(isLocalApi ? 'local' : 'cloud')"
        >
          <Cloud :size="14" class="sync-icon" />
          <span>{{ syncLabel }}</span>
        </button>
        
        <button class="icon-btn glass-card" type="button" :title="themeHint" @click="isDarkMode = !isDarkMode">
          <Sun v-if="isDarkMode" :size="16" />
          <Moon v-else :size="16" />
        </button>
        <button class="icon-btn glass-card" title="API 设置" @click="openApiModal(isLocalApi ? 'local' : 'cloud')">
          <Settings :size="16" />
        </button>
        <button class="icon-btn glass-card" style="color: #fca5a5;">
          <Monitor :size="16" />
        </button>
      </div>

      <!-- Tagging progress (true progress) -->
      <div class="top-progress" v-show="taggingProgress > 0">
        <div class="top-progress-bar" :style="{ width: taggingProgress + '%' }"></div>
      </div>
    </header>
  
    <!-- API Settings Modal -->
    <div v-if="showApiModal" class="modal-mask" @mousedown.self="showApiModal = false">
      <div class="modal glass-card">
        <div class="modal-header">
          <div class="modal-title">API 设置（OpenAI 兼容）</div>
          <button class="icon-btn glass-card" type="button" title="关闭" @click="showApiModal = false">
            <X :size="16" />
          </button>
        </div>
  
        <div class="modal-tabs">
          <button class="tab-btn" :class="{ active: activeApiTab === 'local' }" type="button" @click="activeApiTab = 'local'">
            本地
          </button>
          <button class="tab-btn" :class="{ active: activeApiTab === 'cloud' }" type="button" @click="activeApiTab = 'cloud'">
            云端
          </button>
        </div>
  
        <div class="modal-body" v-if="activeApiTab === 'local'">
          <label class="field">
            <div class="label">Base URL</div>
            <input class="input" v-model="localApiBaseUrl" placeholder="http://127.0.0.1:1234/v1" />
          </label>
          <label class="field">
            <div class="label">Model</div>
            <input class="input" v-model="localApiModel" placeholder="local-model" />
          </label>
          <label class="field">
            <div class="label">API Key（可选）</div>
            <input class="input" type="password" autocomplete="off" v-model="localApiKey" placeholder="（无）" />
          </label>
          <div class="tip">右键点击顶部“本地/云端”按钮可快速打开此窗口。</div>
        </div>
  
        <div class="modal-body" v-else>
          <label class="field">
            <div class="label">Base URL</div>
            <input class="input" v-model="cloudApiBaseUrl" placeholder="https://api.openai.com/v1" />
          </label>
          <label class="field">
            <div class="label">Model</div>
            <input class="input" v-model="cloudApiModel" placeholder="例如：gpt-4o-mini" />
          </label>
          <label class="field">
            <div class="label">API Key</div>
            <input class="input" type="password" autocomplete="off" v-model="cloudApiKey" placeholder="sk-..." />
          </label>
        </div>
  
        <div class="modal-actions">
          <button class="btn" type="button" @click="showApiModal = false">完成</button>
          <button class="btn secondary" type="button" @click="(isLocalApi = activeApiTab === 'local'); showApiModal = false">
            切换到此配置
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Topbar Styles */
.topbar-root {
  width: 100%;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 100%;
  position: relative;
}

.top-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgba(46, 182, 255, 0.10);
  overflow: hidden;
}

.top-progress-bar {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--primary) 0%, #0099ff 55%, #00d2ff 100%);
  box-shadow: 0 -2px 10px rgba(46, 182, 255, 0.5);
  transition: width 0.18s ease;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: var(--ui-solid-bg);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--glass-shadow-sm);
  border: 1px solid var(--glass-border-light);
  transition: background-color var(--theme-ease), border-color var(--theme-ease), box-shadow var(--theme-ease);
}

.logo-text {
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -0.5px;
  color: var(--text-main);
}

.nav-links {
  display: flex;
  gap: 32px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  height: 100%;
}

.nav-item {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  display: flex;
  align-items: center;
  height: 100%;
  position: relative;
  transition: color 0.2s ease;
}

.nav-item:hover {
  color: var(--text-main);
}

.nav-item.active {
  color: var(--primary);
}

.nav-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background-color: var(--primary);
  border-radius: 3px 3px 0 0;
  box-shadow: 0 -2px 8px rgba(46, 182, 255, 0.5);
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sync-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ui-badge-bg);
  color: var(--primary);
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  border: 1px solid var(--ui-badge-border);
  margin-right: 12px;
  cursor: pointer;
  outline: none;
  appearance: none;
  transition: background-color var(--theme-ease), border-color var(--theme-ease), color var(--theme-ease);
}

.sync-icon {
  stroke-width: 2.5px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%; /* circular buttons */
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.icon-btn:hover {
  color: var(--primary);
  transform: translateY(-1px);
  box-shadow: var(--glass-shadow-lg);
}

/* Modal */
.modal-mask {
  position: fixed;
  inset: 0;
  background: var(--ui-overlay-mask);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  transition: background-color var(--theme-ease);
}

.modal {
  width: min(520px, calc(100vw - 28px));
  border-radius: 16px;
  padding: 16px;
  border: 1px solid var(--glass-border-dark);
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.modal-title {
  font-size: 14px;
  font-weight: 900;
  color: var(--text-main);
  letter-spacing: 0.5px;
}

.modal-tabs {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.tab-btn {
  flex: 1;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--glass-border-light);
  background: var(--ui-control-bg-soft);
  color: var(--text-muted);
  font-weight: 800;
  cursor: pointer;
  transition: background-color var(--theme-ease), border-color var(--theme-ease), color var(--theme-ease);
}

.tab-btn.active {
  color: var(--primary);
  border-color: rgba(46, 182, 255, 0.35);
  background: rgba(46, 182, 255, 0.10);
}

.modal-body {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field .label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-light);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--glass-border-light);
  background: var(--ui-control-bg);
  color: var(--text-main);
  outline: none;
  transition: background-color var(--theme-ease), border-color var(--theme-ease), color var(--theme-ease), box-shadow var(--theme-ease);
}

.input:focus {
  border-color: rgba(46, 182, 255, 0.55);
  box-shadow: 0 0 0 3px rgba(46, 182, 255, 0.18);
}

.tip {
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
}

.btn {
  padding: 10px 14px;
  border-radius: 12px;
  border: none;
  background: var(--primary);
  color: white;
  font-weight: 900;
  cursor: pointer;
}

.btn.secondary {
  background: var(--ui-control-bg-secondary);
  color: var(--text-main);
  border: 1px solid var(--glass-border-light);
  transition: background-color var(--theme-ease), border-color var(--theme-ease), color var(--theme-ease);
}
</style>
