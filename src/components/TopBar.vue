<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import { Cloud, Moon, Sun, Settings, HelpCircle, X } from 'lucide-vue-next'
import { computed, ref, watch, nextTick } from 'vue'
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
const showWelcomeModal = ref(true)
const activeApiTab = ref<'local' | 'cloud' | 'sponsor'>('local')
const bodyWrapperRef = ref<HTMLElement | null>(null)

watch(activeApiTab, async (newVal, oldVal) => {
  if (newVal === oldVal) return;
  const wrapper = bodyWrapperRef.value;
  if (!wrapper) return;

  const startHeight = wrapper.offsetHeight;
  wrapper.style.height = startHeight + 'px';

  await nextTick();

  const newContent = wrapper.querySelector('.modal-body:not(.tab-fade-leave-active)') as HTMLElement;
  if (newContent) {
    const targetHeight = newContent.offsetHeight;
    void wrapper.offsetHeight;
    wrapper.style.height = targetHeight + 'px';

    setTimeout(() => {
      wrapper.style.height = 'auto';
    }, 300);
  }
});

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
      <div class="logo" title="nnegret.com">
        <img src="../assets/nnegret_logo_title.svg" class="main-logo" alt="nnegret logo" />
      </div>
  
      <!-- Center: Navigation -->
      <nav class="nav-links">
        <a href="#" class="nav-item">FK 大力</a>
        <a href="#" class="nav-item active">DATASET</a>
        <a href="#" class="nav-item">FK 赵包</a>
        <a href="#" class="nav-item">LV CS</a>
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
        <button class="icon-btn glass-card" title="使用帮助" @click="showWelcomeModal = true">
          <HelpCircle :size="16" />
        </button>
      </div>

      <!-- Tagging progress (true progress) -->
      <div class="top-progress" v-show="taggingProgress > 0">
        <div class="top-progress-bar" :style="{ width: taggingProgress + '%' }"></div>
      </div>
    </header>
  
    <!-- API Settings Modal -->
    <Transition name="modal" type="animation" :duration="{ enter: 400, leave: 300 }">
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
            <button class="tab-btn sponsor-btn" :class="{ active: activeApiTab === 'sponsor' }" type="button" @click="activeApiTab = 'sponsor'">
              赞助
            </button>
          </div>
    
          <div class="modal-body-wrapper" ref="bodyWrapperRef">
            <Transition name="tab-fade">
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
    
          <div class="modal-body" v-else-if="activeApiTab === 'cloud'">
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

          <div class="modal-body sponsor-body" v-else-if="activeApiTab === 'sponsor'">
            <div class="sponsor-content">
              <div class="sponsor-image-wrapper">
                <img src="../assets/ZFB.jpg" alt="支付宝赞助" class="sponsor-image" />
              </div>
              <div class="sponsor-message">
                <h4 class="sponsor-title">💖 感谢您的支持与鼓励！</h4>
                <p class="sponsor-desc">
                  您的每一次赞助都是我优化打磨这款工具的巨大动力。<br/>
                  <strong>请务必在打赏时备注署名</strong>，我会在网页的赞助名单上特别向您答谢！
                </p>
                <div class="sponsor-contact">
                  💌 有任何问题想询问，或有功能建议，直接联系群主即可，谢谢 🙏
                </div>
              </div>
            </div>
          </div>
            </Transition>
          </div>
    
          <div class="modal-actions">
            <button class="btn" type="button" @click="showApiModal = false">完成</button>
            <button class="btn secondary" type="button" @click="(isLocalApi = activeApiTab === 'local'); showApiModal = false">
              切换到此配置
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Welcome / Instructions Modal -->
    <Transition name="modal" type="animation" :duration="{ enter: 400, leave: 300 }">
      <div v-if="showWelcomeModal" class="modal-mask" @mousedown.self="showWelcomeModal = false">
        <div class="modal glass-card welcome-card">
          <div class="modal-header welcome-header">
            <div class="welcome-logo-wrapper">
              <img src="../assets/nnegret_logo_title.svg" class="main-logo welcome-logo" alt="nnegret logo" />
              <div class="q-group">Q 群：173273201</div>
            </div>
          </div>
    
          <div class="modal-body welcome-body">
            <p class="welcome-intro">欢迎！在使用前，您可以按需选择以下两种方式之一连接大模型：</p>
            
            <div class="instruction-blocks">
              <div class="instruction-block">
                <div class="block-header">
                  <span class="block-icon">💻</span>
                  <span class="block-title">方式一：本地运行大模型（推荐）</span>
                </div>
                <ul class="block-steps">
                  <li>1. 打开并运行 <strong>LM Studio</strong> 客户端。</li>
                  <li>2. 搜索并 <strong>加载</strong> 您想要使用的模型。</li>
                  <li>3. 开启 <strong>Local Server</strong> 服务，并务必在右侧设置中开启 <strong>CORS （跨域）</strong>。</li>
                </ul>
              </div>

              <div class="instruction-block">
                <div class="block-header">
                  <span class="block-icon">☁️</span>
                  <span class="block-title">方式二：使用云端 API</span>
                </div>
                <ul class="block-steps">
                  <li>1. 点击右上角 <strong>齿轮图标</strong>（或右键顶部同步按钮）打开设置。</li>
                  <li>2. 将选项卡切换至 <strong>云端</strong>。</li>
                  <li>3. 填入符合 <strong>OpenAI 格式</strong> 的接口地址 (Base URL) 与 API Key 即可。</li>
                </ul>
              </div>
            </div>

            <div class="tip mini">🎯 提示：本工具完全不联网，您的设置信息将安全且自动保存在浏览器本地。</div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Modal Transition - Scoped Blurred Left Slide-in */
.modal-enter-active {
  transition: opacity 0.3s ease;
}

.modal-leave-active {
  transition: opacity 0.3s ease-out !important;
}

.modal-enter-active .modal {
  /* 速度加快：0.4s */
  animation: slide-in-blurred-left 0.4s cubic-bezier(0.23, 1, 0.32, 1) both;
}

.modal-leave-active .modal {
  /* 极速退出：0.25s */
  animation: slide-out-blurred-left 0.25s cubic-bezier(0.755, 0.05, 0.855, 0.06) both !important;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0 !important;
}

@keyframes slide-in-blurred-left {
  0% {
    /* 从左侧 -1000px 划入，横向大幅度拉伸，极高模糊 */
    transform: translateX(-1000px) scaleX(3) scaleY(0.2);
    transform-origin: 0% 50%;
    filter: blur(80px);
    opacity: 0;
  }
  100% {
    transform: translateX(0) scaleX(1) scaleY(1);
    transform-origin: 50% 50%;
    filter: blur(0);
    opacity: 1;
  }
}

@keyframes slide-out-blurred-left {
  0% {
    transform: translateX(0) scaleX(1) scaleY(1);
    transform-origin: 50% 50%;
    filter: blur(0);
    opacity: 1;
  }
  100% {
    transform: translateX(-1000px) scaleX(3) scaleY(0.2);
    transform-origin: 0% 50%;
    filter: blur(80px);
    opacity: 0;
  }
}

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
  /* Production hardening: ensure blur even if global .glass-bar is missing/overridden */
  background: var(--acrylic-bar-bg);
  backdrop-filter: blur(12px);
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

.main-logo {
  height: 64px;
  width: auto;
  transition: filter var(--theme-ease);
  /* Optional: if logo is black, invert in dark mode */
}

/* Theme adaptation for SVG logo */
:root.theme-dark .main-logo {
  filter: invert(1) brightness(1.2) contrast(1.1);
}

.logo {
  display: flex;
  align-items: center;
  cursor: default;
  padding: 4px 0;
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

.tab-btn.sponsor-btn.active {
  color: #ff7bac; /* 马卡龙粉 */
  border-color: rgba(255, 123, 172, 0.35);
  background: rgba(255, 123, 172, 0.12);
}

.modal-body-wrapper {
  position: relative;
  transition: height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: hidden;
  margin-top: 14px;
}

.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.tab-fade-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.tab-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.tab-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sponsor-content {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 8px 4px 4px 4px;
}

.sponsor-image-wrapper {
  flex-shrink: 0;
  width: 140px;
  height: 140px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--glass-border-light);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  background: white; /* 确保暗色模式下二维码反向对比度依然清晰 */
  padding: 6px;
}

.sponsor-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 8px;
}

.sponsor-message {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sponsor-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: 0.5px;
}

.sponsor-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-main);
}

.sponsor-desc strong {
  color: var(--primary);
  font-weight: 700;
}

.sponsor-contact {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.5;
  background: var(--ui-control-bg-soft);
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px dashed rgba(46, 182, 255, 0.3);
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

/* Welcome Card Specific Styles */
.welcome-card {
  max-width: 480px;
  text-align: center;
}

.welcome-header {
  flex-direction: column;
  justify-content: center;
  padding: 10px 0 10px 0;
}

.welcome-logo-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.welcome-logo {
  height: 90px !important; /* Larger logo for welcome card */
}

.q-group {
  font-size: 19px;
  font-weight: 700;
  color: var(--primary);
  letter-spacing: 0.5px;
}

.welcome-btn {
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  font-size: 14px;
  letter-spacing: 1px;
}

.welcome-intro {
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.instruction-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
}

.instruction-block {
  background: var(--ui-control-bg-soft);
  border: 1px solid var(--glass-border-light);
  border-radius: 12px;
  padding: 14px;
}

.block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.block-icon {
  font-size: 15px;
}

.block-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: 0.5px;
}

.block-steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-steps li {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.5;
}

.block-steps strong {
  color: var(--text-main);
  font-weight: 700;
}

.tip.mini {
  margin-top: 10px;
  opacity: 0.8;
  text-align: center;
}

</style>
