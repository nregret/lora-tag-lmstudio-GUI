<script setup lang="ts">
import { 
  Settings, 
  User, 
  Shirt, 
  Image as ImageIcon, 
  Palette,
  Plus,
  Wand2,
  X
} from 'lucide-vue-next'
import { ref, computed, watch } from 'vue'
import { activeNodeIds, activeNodeTagContent, saveActiveNodeTags, batchInsertWord, isLocalApi, isGeneratingTags, generateTagsForActiveNodes } from '../store'

// --- Active Tool ---
const activeTool = ref(0)

// --- Tag Chip View ---
const parsedTags = computed(() => {
  if (!activeNodeTagContent.value.trim()) return []
  return activeNodeTagContent.value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)
})

const removeTag = (index: number) => {
  const tags = [...parsedTags.value]
  tags.splice(index, 1)
  activeNodeTagContent.value = tags.join(', ')
  saveActiveNodeTags()
}

const tagType = ref('tag') 
const tagLength = ref('moderate') 

// --- Fixed Word Insertion State ---
const insertWord = ref('')
const insertPos = ref('start')
const insertIndex = ref(1)

watch(insertIndex, (newVal) => {
  if (newVal) {
    const strVal = newVal.toString()
    if (strVal.length > 3) {
      insertIndex.value = Number(strVal.slice(0, 3))
    }
  }
})

const isShowIndexPopover = ref(false)

const handleIndexClick = () => {
  insertPos.value = 'index'
  isShowIndexPopover.value = !isShowIndexPopover.value
}

const isInsertSuccess = ref(false)

// Global click outside to close popover
import { onMounted, onUnmounted } from 'vue'

const closePopover = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.index-label-container') && !target.closest('.index-popover')) {
    isShowIndexPopover.value = false
  }
}

onMounted(() => {
  window.addEventListener('click', closePopover)
})
onUnmounted(() => {
  window.removeEventListener('click', closePopover)
})

const handleBatchInsert = async () => {
  if (!insertWord.value.trim() || activeNodeIds.value.length === 0) return
  await batchInsertWord(insertWord.value, insertPos.value as 'start' | 'end' | 'index', insertIndex.value)
  
  isShowIndexPopover.value = false // close popover if active
  
  // Trigger success animation
  isInsertSuccess.value = true
  setTimeout(() => {
    isInsertSuccess.value = false
  }, 1000)
}

const propertyTags = ref([
  { id: 'char', name: '人物核心', selected: true },
  { id: 'clothes', name: '服装', selected: true },
  { id: 'accessories', name: '配饰', selected: false },
  { id: 'pose', name: '姿势', selected: false },
  { id: 'bg', name: '背景', selected: true },
  { id: 'angle', name: '拍摄角度', selected: false },
])

const isMultiSelect = computed(() => activeNodeIds.value.length > 1)

const handleInput = () => {
  if (isMultiSelect.value) return
  saveActiveNodeTags()
}

const toggleProperty = (index: number) => {
  propertyTags.value[index].selected = !propertyTags.value[index].selected
}

const generateTags = async () => {
  if (activeNodeIds.value.length === 0) {
    alert("请在画布上先选择至少一张图片！")
    return
  }
  const selectedProps = propertyTags.value.filter(p => p.selected).map(p => p.name)
  await generateTagsForActiveNodes(tagType.value, tagLength.value, selectedProps)
}
</script>

<template>
  <div class="sidebar-wrapper glass-panel">
    <!-- Main Panel -->
    <aside class="sidebar">
      <!-- ============ TAG VIEW PANEL ============ -->
      <template v-if="activeTool === 1">
        <div class="header">
          <div class="title-row">
            <div class="title-with-icon">
              <Shirt :size="20" color="var(--primary)" />
              <h2>Tag 视图</h2>
            </div>
            <div class="tag-count-badge" v-if="parsedTags.length > 0">
              {{ parsedTags.length }} 个
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="content-scroll">
          <template v-if="activeNodeIds.length === 0">
            <div class="tag-empty-state">
              <Shirt :size="36" class="empty-icon" />
              <span>请在画布上选择一张图片</span>
            </div>
          </template>
          <template v-else-if="activeNodeIds.length > 1">
            <div class="tag-empty-state">
              <Shirt :size="36" class="empty-icon" />
              <span>已选中 <strong style="color: var(--primary);">{{ activeNodeIds.length }}</strong> 张图片</span>
            </div>
          </template>
          <template v-else-if="parsedTags.length === 0">
            <div class="tag-empty-state">
              <Shirt :size="36" class="empty-icon" />
              <span>暂无打标内容</span>
            </div>
          </template>
          <template v-else>
            <div class="tag-chip-cloud">
              <div
                v-for="(tag, index) in parsedTags"
                :key="index"
                class="tag-chip glass-card"
              >
                <span class="tag-chip-text">{{ tag }}</span>
                <button class="tag-chip-del" @click="removeTag(index)" title="删除">
                  <X :size="11" />
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Bottom area: raw textarea for quick edit -->
        <div class="actions-area tag-raw-area">
          <div class="tag-raw-label">原始文本</div>
          <div class="textarea-wrapper glass-inset tag-raw-wrapper">
            <textarea
              class="tag-raw-textarea"
              v-model="activeNodeTagContent"
              @input="saveActiveNodeTags"
              placeholder="逗号分隔的打标内容..."
            ></textarea>
          </div>
        </div>
      </template>

      <!-- ============ DEFAULT SETTINGS PANEL ============ -->
      <template v-else>
      <!-- Header -->
      <div class="header">
        <div class="title-row">
          <div class="title-with-icon">
            <Settings :size="20" color="var(--primary)" />
            <h2>打标设置</h2>
          </div>
          <div 
            class="sync-badge glass-card" 
            :class="{ 'local-badge': isLocalApi, 'cloud-badge': !isLocalApi }"
            @click="isLocalApi = !isLocalApi"
            title="点击切换 本地/云端 API"
          >
            {{ isLocalApi ? '本地 API' : '云端 API' }}
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Scrollable Content Area -->
      <div class="content-scroll">
        
        <!-- Tag Type -->
        <div class="section">
          <div class="section-header">
            <h3>打标类型</h3>
          </div>
          <div class="radio-group">
            <label class="radio-label glass-card" :class="{ active: tagType === 'tag' }">
              <input type="radio" value="tag" v-model="tagType"> 
              <span>tag</span>
            </label>
            <label class="radio-label glass-card" :class="{ active: tagType === 'tag+phrase' }">
              <input type="radio" value="tag+phrase" v-model="tagType"> 
              <span>tag+短语</span>
            </label>
            <label class="radio-label glass-card" :class="{ active: tagType === 'natural' }">
              <input type="radio" value="natural" v-model="tagType"> 
              <span>纯自然语言</span>
            </label>
          </div>
        </div>

        <!-- Tag Length -->
        <div class="section" style="margin-top: 24px;">
          <div class="section-header">
            <h3>打标长度</h3>
          </div>
          <div class="radio-group">
            <label class="radio-label glass-card" :class="{ active: tagLength === 'minimal' }">
              <input type="radio" value="minimal" v-model="tagLength"> 
              <span>极简</span>
            </label>
            <label class="radio-label glass-card" :class="{ active: tagLength === 'moderate' }">
              <input type="radio" value="moderate" v-model="tagLength"> 
              <span>适中</span>
            </label>
            <label class="radio-label glass-card" :class="{ active: tagLength === 'detailed' }">
              <input type="radio" value="detailed" v-model="tagLength"> 
              <span>详细</span>
            </label>
          </div>
        </div>

        <!-- Image Properties -->
        <div class="section" style="margin-top: 24px;">
          <div class="section-header">
            <h3>图片属性分类</h3>
          </div>
          <div class="tag-cloud">
            <span 
              v-for="(prop, index) in propertyTags" 
              :key="prop.id" 
              class="check-tag glass-card"
              :class="{ active: prop.selected }"
              @click="toggleProperty(index)"
            >
              {{ prop.name }}
            </span>
          </div>
        </div>

        <div class="divider subtle"></div>

        <!-- Fixed Word Insertion -->
        <div class="section">
          <div class="section-header">
            <h3>固有词插入</h3>
          </div>
          <div class="insert-control">
            <input type="text" v-model="insertWord" placeholder="输入要插入的词语 (如 1girl, masterpiece)..." class="insert-input" />
            
            <div class="radio-group" style="margin-top: 4px;">
              <label class="radio-label glass-card" :class="{ active: insertPos === 'start' }">
                <input type="radio" value="start" v-model="insertPos"> 
                <span>最前</span>
              </label>

              <!-- Index option moved to the middle -->
              <div class="radio-label glass-card index-label-container" :class="{ active: insertPos === 'index' }">
                <div class="index-btn-content" @click="handleIndexClick">
                  <span>{{ insertPos === 'index' ? `序号: ${insertIndex}` : '序号' }}</span>
                </div>
                
                <!-- Popover Input -->
                <transition name="pop">
                  <div v-if="isShowIndexPopover" class="index-popover glass-card" @click.stop>
                    <div class="popover-arrow"></div>
                    <span class="popover-text">插入位置的序号</span>
                    <input 
                      type="number" 
                      v-model.number="insertIndex" 
                      min="1" 
                      max="999"
                      class="popover-input" 
                      autofocus
                    />
                  </div>
                </transition>
              </div>
              
              <label class="radio-label glass-card" :class="{ active: insertPos === 'end' }">
                <input type="radio" value="end" v-model="insertPos"> 
                <span>最后</span>
              </label>
            </div>
            
            <button 
              class="btn-insert" 
              :class="{ 'success-anim': isInsertSuccess }" 
              :disabled="activeNodeIds.length === 0" 
              @click="handleBatchInsert">
              {{ isInsertSuccess ? '插入成功 ✓' : '确认插入' }}
            </button>
          </div>
        </div>

        <div class="divider subtle"></div>

        <!-- Tagging Content -->
        <div class="section">
          <div class="section-header">
            <h3>打标内容</h3>
          </div>
          <div class="textarea-wrapper glass-inset" :class="{ 'is-disabled': isMultiSelect }">
            <template v-if="isMultiSelect">
              <div class="multi-select-message">
                <span class="count">{{ activeNodeIds.length }}</span>
                <span class="text">张图片已选择</span>
              </div>
            </template>
            <template v-else>
              <textarea 
                v-model="activeNodeTagContent" 
                @input="handleInput"
                placeholder="将在此显示生成的打标内容..."></textarea>
            </template>
          </div>
        </div>
      </div>

      <!-- Bottom Actions -->
      <div class="actions-area">
        <button class="btn-primary" :disabled="activeNodeIds.length === 0 || isGeneratingTags" @click="generateTags">
          <Wand2 v-if="!isGeneratingTags" :size="16" />
          <span v-if="isGeneratingTags" class="loading-spinner"></span>
          {{ isGeneratingTags ? '生成中...' : '生成打标tag' }}
        </button>
      </div>
      </template>
    </aside>

    <!-- Floating Tools Toolbar -->
    <div class="floating-tools">
      <button class="tool-btn glass-card" :class="{ active: activeTool === 0 }" @click="activeTool = 0" title="设置">
        <User :size="18" />
      </button>
      <button class="tool-btn glass-card" :class="{ active: activeTool === 1 }" @click="activeTool = 1" title="Tag 视图">
        <Shirt :size="18" />
      </button>
      <button class="tool-btn glass-card" :class="{ active: activeTool === 2 }" @click="activeTool = 2" title="图片">
        <ImageIcon :size="18" />
      </button>
      <button class="tool-btn glass-card" :class="{ active: activeTool === 3 }" @click="activeTool = 3" title="调色">
        <Palette :size="18" />
      </button>

      <div class="spacer"></div>

      <!-- Add node button at bottom right -->
      <button class="tool-btn glass-card add-node-btn">
        <Plus :size="20" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Sync Badge */
.sync-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.local-badge {
  background: rgba(46, 182, 255, 0.1);
  color: var(--primary);
  border: 1px solid rgba(46, 182, 255, 0.3);
}
.cloud-badge {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.sync-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* Spinner */
.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.sidebar-wrapper {
  display: flex;
  height: 100%;
  border-right: none;
  border-top: none;
  border-bottom: none;
}

.sidebar {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 26px 0;
  border-right: 1px solid var(--glass-border-dark);
}

.header {
  padding: 0 26px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-with-icon {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-with-icon h2 {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text-main);
  margin: 0;
}

.divider {
  height: 1px;
  background: var(--glass-border-dark);
  margin: 20px 0;
}

.divider.subtle {
  margin: 24px 24px;
  background: rgba(200, 210, 225, 0.2);
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 26px;
}

/* Custom Scrollbar */
.content-scroll::-webkit-scrollbar {
  width: 5px;
}
.content-scroll::-webkit-scrollbar-thumb {
  background: var(--glass-border-dark);
  border-radius: 5px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-header h3 {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 1px;
  color: var(--text-main);
  margin: 0;
}

/* Radio Group Selection */
.radio-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.radio-label {
  flex: 1;
  min-width: 76px;
  text-align: center;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 300;
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--glass-border-subtle);
  background: rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.radio-label input[type="radio"] {
  display: none;
}

.radio-label:hover {
  background: rgba(255, 255, 255, 0.8);
  color: var(--text-main);
  box-shadow: var(--glass-shadow-sm);
  transform: translateY(-1px);
}

.radio-label.active {
  background: var(--primary);
  color: white;
  border-color: rgba(46, 182, 255, 0.6);
  box-shadow: 0 4px 12px rgba(46, 182, 255, 0.25);
}

/* Check Tags */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.check-tag {
  font-size: 14px;
  font-weight: 250;
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(240, 244, 248, 0.5);
  border: 1px solid var(--glass-border-light);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.check-tag:hover {
  background: white;
  color: var(--text-main);
  box-shadow: var(--glass-shadow-sm);
}

.check-tag.active {
  background: rgba(46, 182, 255, 0.1);
  color: var(--primary);
  border-color: rgba(46, 182, 255, 0.3);
  box-shadow: 0 2px 8px rgba(46, 182, 255, 0.15);
}

/* Textarea */
.textarea-wrapper {
  position: relative;
  height: 140px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
}

textarea {
  flex: 1;
  width: 100%;
  background: transparent;
  border: none;
  resize: none;
  color: var(--text-main);
  font-size: 15px;
  line-height: 1.6;
}

textarea:focus {
  outline: none;
}

textarea::placeholder {
  color: var(--text-light);
}

.is-disabled {
  background: rgba(200, 210, 225, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.multi-select-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-light);
  opacity: 0.8;
}

.multi-select-message .count {
  font-size: 32px;
  font-weight: 900;
  color: var(--text-muted);
}

.multi-select-message .text {
  font-size: 14px;
  font-weight: 600;
}

/* Insert Controls */
.insert-control {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.insert-input {
  width: 100%;
  background: rgba(225, 232, 240, 0.4);
  border: 1px solid var(--glass-border-subtle);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 14px;
  color: var(--text-main);
  transition: all 0.2s;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
}

.insert-input:focus {
  background: white;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(46, 182, 255, 0.2);
}

/* Index Number Popover */
.index-label-container {
  position: relative;
  padding: 0;
  display: flex;
}

.index-btn-content {
  width: 100%;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.index-popover {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: 140px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--primary);
  box-shadow: 0 8px 24px rgba(46, 182, 255, 0.2);
  border-radius: 12px;
  z-index: 100;
  cursor: default;
}

.popover-arrow {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.9);
  border-right: 1px solid var(--primary);
  border-bottom: 1px solid var(--primary);
}

.popover-text {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.popover-input {
  width: 100%;
  text-align: center;
  border-radius: 8px;
  border: 1px solid var(--glass-border-dark);
  background: white;
  color: var(--text-main);
  font-size: 18px;
  font-weight: 800;
  outline: none;
  padding: 8px;
  transition: border-color 0.2s;
}

.popover-input:focus {
  border-color: var(--primary);
}

/* Hide spin buttons for input type number */
.popover-input::-webkit-outer-spin-button,
.popover-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Popover Transition */
.pop-enter-active,
.pop-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px) scale(0.9);
}

.btn-insert {
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--text-muted);
  color: white;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 1px;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
}

.btn-insert:hover:not(:disabled) {
  background: var(--text-main);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

.btn-insert:active:not(:disabled) {
  transform: translateY(1px);
}

.btn-insert:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

/* Success Animation */
.success-anim {
  background: var(--success) !important;
  transform: scale(1.02);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.4) !important;
}

/* Actions */
.actions-area {
  padding: 26px 26px 0;
  display: flex;
  flex-direction: column;
}

.btn-primary {
  width: 100%;
  padding: 18px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--primary) 0%, #0099ff 100%);
  color: white;
  font-weight: 800;
  font-size: 18px;
  letter-spacing: 1.2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 8px 20px rgba(46, 182, 255, 0.3), inset 0 1px 1px rgba(255,255,255,0.4);
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
  border: none;
}

.btn-primary:active {
  transform: translateY(1px);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(46, 182, 255, 0.4), inset 0 1px 1px rgba(255,255,255,0.4);
}

/* Floating Tools Toolbar */
.floating-tools {
  width: 64px;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: all 0.2s;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tool-btn:hover {
  color: var(--primary);
  transform: scale(1.05);
}

.tool-btn.active {
  background: var(--primary);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(46, 182, 255, 0.3);
}

.spacer {
  flex: 1;
}

.add-node-btn {
  border: 1px dashed var(--glass-border-dark);
  background: transparent;
  box-shadow: none;
}
.add-node-btn:hover {
  background: rgba(46, 182, 255, 0.1);
  border-color: var(--primary);
}

/* ====== Tag View Styles ====== */
.tag-count-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(46, 182, 255, 0.1);
  color: var(--primary);
  border: 1px solid rgba(46, 182, 255, 0.25);
  letter-spacing: 0.5px;
}

.tag-chip-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 12px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px 5px 12px;
  border-radius: 20px;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--text-main);
  cursor: default;
  transition: all 0.15s ease;
  border-color: rgba(46, 182, 255, 0.2);
  background: rgba(46, 182, 255, 0.06);
}

.tag-chip:hover {
  background: rgba(46, 182, 255, 0.12);
  border-color: rgba(46, 182, 255, 0.4);
  box-shadow: 0 2px 8px rgba(46, 182, 255, 0.15);
}

.tag-chip-text {
  line-height: 1.3;
}

.tag-chip-del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-light);
  cursor: pointer;
  padding: 0;
  margin: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.tag-chip-del:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.tag-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 48px 0;
  color: var(--text-light);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.empty-icon {
  color: var(--glass-border-dark);
  opacity: 0.6;
}

.tag-raw-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-raw-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-light);
  text-transform: uppercase;
}

.tag-raw-wrapper {
  height: 200px; /* ← 在这里改高度 */
  padding: 10px 12px;
}

.tag-raw-textarea {
  resize: none;
  height: 100%;
  width: 100%;
}
</style>
