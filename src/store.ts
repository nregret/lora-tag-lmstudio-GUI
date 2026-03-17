import { ref, watch } from 'vue'
import systemPromptTemplate from './assets/systemprompt.txt?raw'
import { blobToDataUrlScaled } from './utils/image'

export interface NodeData {
  id: number
  title: string
  baseName: string
  x: number
  y: number
  width: number
  aspectRatio: number
  imageUrl: string
}

export const isLocalApi = ref<boolean>(true)
export const isGeneratingTags = ref<boolean>(false)
export const taggingProgress = ref<number>(0)

// --- Theme ---
export const isDarkMode = ref<boolean>(false)

function loadTheme() {
  try {
    const raw = localStorage.getItem('loraTag.theme')
    if (raw === 'dark') isDarkMode.value = true
    else if (raw === 'light') isDarkMode.value = false
    else {
      isDarkMode.value = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false
    }
  } catch {
    isDarkMode.value = false
  }
}

function applyTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('theme-dark', isDarkMode.value)
  // Helps form controls match theme on supported browsers
  ;(root.style as any).colorScheme = isDarkMode.value ? 'dark' : 'light'
}

loadTheme()
applyTheme()
watch(isDarkMode, (val) => {
  try {
    localStorage.setItem('loraTag.theme', val ? 'dark' : 'light')
  } catch {}
  applyTheme()
})

// --- API Config (OpenAI-compatible) ---
export const localApiBaseUrl = ref<string>('http://127.0.0.1:1234/v1')
export const localApiModel = ref<string>('local-model')
export const localApiKey = ref<string>('')

export const cloudApiBaseUrl = ref<string>('https://api.openai.com/v1')
export const cloudApiModel = ref<string>('')
export const cloudApiKey = ref<string>('')

function loadApiConfig() {
  try {
    const raw = localStorage.getItem('loraTag.apiConfig')
    if (!raw) return
    const cfg = JSON.parse(raw)
    if (typeof cfg?.isLocalApi === 'boolean') isLocalApi.value = cfg.isLocalApi

    if (typeof cfg?.localApiBaseUrl === 'string') localApiBaseUrl.value = cfg.localApiBaseUrl
    if (typeof cfg?.localApiModel === 'string') localApiModel.value = cfg.localApiModel
    if (typeof cfg?.localApiKey === 'string') localApiKey.value = cfg.localApiKey

    if (typeof cfg?.cloudApiBaseUrl === 'string') cloudApiBaseUrl.value = cfg.cloudApiBaseUrl
    if (typeof cfg?.cloudApiModel === 'string') cloudApiModel.value = cfg.cloudApiModel
    if (typeof cfg?.cloudApiKey === 'string') cloudApiKey.value = cfg.cloudApiKey
  } catch {}
}

function saveApiConfig() {
  try {
    localStorage.setItem(
      'loraTag.apiConfig',
      JSON.stringify({
        isLocalApi: isLocalApi.value,
        localApiBaseUrl: localApiBaseUrl.value,
        localApiModel: localApiModel.value,
        localApiKey: localApiKey.value,
        cloudApiBaseUrl: cloudApiBaseUrl.value,
        cloudApiModel: cloudApiModel.value,
        cloudApiKey: cloudApiKey.value
      })
    )
  } catch {}
}

loadApiConfig()
watch([
  isLocalApi,
  localApiBaseUrl,
  localApiModel,
  localApiKey,
  cloudApiBaseUrl,
  cloudApiModel,
  cloudApiKey
], saveApiConfig)

export function getActiveApiBaseUrl() {
  return (isLocalApi.value ? localApiBaseUrl.value : cloudApiBaseUrl.value).replace(/\/+$/, '')
}

export function getActiveApiModel() {
  return (isLocalApi.value ? localApiModel.value : cloudApiModel.value).trim()
}

export function getActiveApiKey() {
  return (isLocalApi.value ? localApiKey.value : cloudApiKey.value).trim()
}

export function getChatCompletionsUrl() {
  return `${getActiveApiBaseUrl()}/chat/completions`
}

export function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = getActiveApiKey()
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

export const nodes = ref<NodeData[]>([])
export const activeNodeIds = ref<number[]>([])
export const activeNodeTagContent = ref<string>('')
export const currentDirectoryHandle = ref<any>(null)

// Whenever the active nodes change, load its corresponding .txt file if exactly one is selected
watch(activeNodeIds, async (newIds) => {
  if (newIds.length !== 1 || !currentDirectoryHandle.value) {
    activeNodeTagContent.value = ''
    return
  }
  
  const node = nodes.value.find(n => n.id === newIds[0])
  if (!node) return
  
  try {
    const txtFileName = node.baseName + '.txt'
    // Get file handle, create it if it doesn't exist
    const fileHandle = await currentDirectoryHandle.value.getFileHandle(txtFileName, { create: true })
    const file = await fileHandle.getFile()
    const text = await file.text()
    activeNodeTagContent.value = text
  } catch (error) {
    console.error("Failed to read/create txt file:", error)
    activeNodeTagContent.value = ''
  }
})

// Save the text to the corresponding .txt file
export const saveActiveNodeTags = async () => {
  if (activeNodeIds.value.length !== 1 || !currentDirectoryHandle.value) return
  
  const node = nodes.value.find(n => n.id === activeNodeIds.value[0])
  if (!node) return
  
  try {
    const txtFileName = node.baseName + '.txt'
    const fileHandle = await currentDirectoryHandle.value.getFileHandle(txtFileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(activeNodeTagContent.value)
    await writable.close()
  } catch (error) {
    console.error("Failed to save txt file:", error)
  }
}

// Batch insert a specific word to all selected nodes
export const batchInsertWord = async (word: string, pos: 'start' | 'end' | 'index', index: number = 1) => {
  if (activeNodeIds.value.length === 0 || !currentDirectoryHandle.value || !word.trim()) return
  
  const trimmedWord = word.trim()
  
  for (const nodeId of activeNodeIds.value) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) continue
    
    try {
      const txtFileName = node.baseName + '.txt'
      // Get file handle, create it if it doesn't exist
      const fileHandle = await currentDirectoryHandle.value.getFileHandle(txtFileName, { create: true })
      let text = ''
      
      try {
        const file = await fileHandle.getFile()
        text = await file.text()
      } catch (e) {
        // file might be empty, ignore
      }
      
      let tags = text.split(',').map(t => t.trim()).filter(t => t.length > 0)
      
      if (pos === 'start') {
        tags.unshift(trimmedWord)
      } else if (pos === 'end') {
        tags.push(trimmedWord)
      } else if (pos === 'index') {
        // user index is 1-based. 1 means insert at position 1 (index 0).
        // For example, if index is 3, it inserts at position 3, i.e. after the 2nd comma.
        const insertAt = Math.max(0, index - 1)
        tags.splice(insertAt, 0, trimmedWord)
      }
      
      const newText = tags.join(', ')
      
      const writable = await fileHandle.createWritable()
      await writable.write(newText)
      await writable.close()
      
      // Update UI if this is the only node selected
      if (activeNodeIds.value.length === 1 && activeNodeIds.value[0] === nodeId) {
        activeNodeTagContent.value = newText
      }
      
    } catch (error) {
      console.error(`Failed to insert word for node ${node.title}:`, error)
    }
  }
}

// Generate tags for selected nodes using Local or Cloud API
export const generateTagsForActiveNodes = async (
  tagType: string, 
  tagLength: string, 
  selectedProps: string[]
) => {
  if (activeNodeIds.value.length === 0 || !currentDirectoryHandle.value) return
  
  isGeneratingTags.value = true
  taggingProgress.value = 0
  try {
    const total = activeNodeIds.value.length
    let completed = 0
    const setProgress = (stage: number) => {
      // stage: 0..1 for current item
      const pct = Math.round(((completed + Math.min(1, Math.max(0, stage))) / total) * 100)
      taggingProgress.value = Math.min(100, Math.max(taggingProgress.value, pct))
    }

    for (const nodeId of activeNodeIds.value) {
      const node = nodes.value.find(n => n.id === nodeId)
      if (!node) continue
      setProgress(0.05)
      
      // Get Base64 image from Blob URL
      const response = await fetch(node.imageUrl)
      const blob = await response.blob()
      const base64data = await blobToDataUrlScaled(blob, { maxSide: 768, mime: 'image/jpeg', quality: 0.85 })
      setProgress(0.25)

      // Construct Prompt Additions
      let customInstructions = `\n\n【用户动态要求】\n`
      if (tagType === 'tag') {
        customInstructions += `- 格式要求：生成的都是词语，以英文逗号分隔，无换行。\n`
      } else if (tagType === 'tag+phrase') {
        customInstructions += `- 格式要求：以英文逗号分隔的标签和短语混合，无换行。\n`
      } else if (tagType === 'natural') {
        customInstructions += `- 格式要求：纯自然语言描述段落（如一两句话），不使用纯逗号分隔的孤立标签。\n`
      }

      const lengthMap: Record<string, string> = {
        'minimal': '极简（尽量少于10个词或极短的短语）',
        'moderate': '适中（15-30个词/短语）',
        'detailed': '详细（尽可能多地描述画面细节，30个词以上）'
      }
      customInstructions += `- 长度要求：代表总打标反推出来的长度为【${lengthMap[tagLength] || '适中'}】。\n`

      if (selectedProps.length > 0) {
        customInstructions += `- 内容范围限定：你只需要反推和打标以下被勾选的图片属性分类：【${selectedProps.join('、')}】。图片中即使有其他特征，如果没有提及在这几个分类中，请绝对不要输出相关的标签。\n`
      }

      const finalPrompt = systemPromptTemplate + customInstructions

      // API Call (OpenAI-compatible)
      const baseUrl = getActiveApiBaseUrl()
      const model = getActiveApiModel()
      if (!baseUrl) throw new Error('未配置 API Base URL')
      if (!model) throw new Error('未配置 Model')
      const apiUrl = getChatCompletionsUrl()
      
      const apiPayload = {
        model,
        messages: [
          { role: "system", content: finalPrompt },
          { 
            role: "user", 
            content: [
              { type: "text", text: "请根据系统提示词和图片进行打标：" },
              { type: "image_url", image_url: { url: base64data } }
            ] 
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      }

      const reqHeaders = buildAuthHeaders()

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(apiPayload)
      })

      if (!res.ok) {
        let errBody = ''
        try { errBody = await res.text() } catch {}
        console.error('Tagging API error:', res.status, res.statusText, errBody)
        throw new Error(`API 请求失败: ${res.status} ${res.statusText}${errBody ? `\n${errBody}` : ''}`)
      }

      const data = await res.json()
      const choice0 = data?.choices?.[0]
      const content = choice0?.message?.content
      let generatedText = ''
      if (typeof content === 'string') generatedText = content
      else if (Array.isArray(content)) {
        generatedText = content
          .map((b: any) => (typeof b?.text === 'string' ? b.text : typeof b?.content === 'string' ? b.content : ''))
          .filter(Boolean)
          .join('')
      } else if (typeof choice0?.text === 'string') generatedText = choice0.text
      else if (typeof data?.output_text === 'string') generatedText = data.output_text

      generatedText = String(generatedText || '').trim()
      if (!generatedText) {
        throw new Error('模型返回空内容（请检查本地模型是否可正常对话/是否支持图片输入）')
      }

      // Hard guard: enforce the user's selected property scope for comma-separated outputs.
      // (For natural-language mode, reliable filtering is not feasible; rely on prompting.)
      if (selectedProps.length > 0 && (tagType === 'tag' || tagType === 'tag+phrase')) {
        generatedText = filterCommaSeparatedBySelectedProps(generatedText, selectedProps)
      }
      setProgress(0.8)

      // Save to file overwriting previous content
      const txtFileName = node.baseName + '.txt'
      const fileHandle = await currentDirectoryHandle.value.getFileHandle(txtFileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(generatedText)
      await writable.close()
      setProgress(1.0)
      completed += 1
      taggingProgress.value = Math.round((completed / total) * 100)

      // Update UI if viewing this node
      if (activeNodeIds.value.length === 1 && activeNodeIds.value[0] === nodeId) {
        activeNodeTagContent.value = generatedText
      }
    }
  } catch (error) {
    console.error("生成标签失败:", error)
    const msg = (error as Error).message || ''
    if (/image|vision|multimodal|modalit|image_url|content.*array|unsupported/i.test(msg)) {
      alert("打标失败：当前本地模型不支持图片输入（请在 LM Studio 换成支持视觉的模型，或改用云端多模态模型）")
    } else {
      alert("打标失败：" + msg)
    }
  } finally {
    isGeneratingTags.value = false
    taggingProgress.value = 100
    window.setTimeout(() => {
      if (!isGeneratingTags.value) taggingProgress.value = 0
    }, 800)
  }
}

type PropertyName =
  | '人物核心'
  | '服装'
  | '配饰'
  | '姿势'
  | '表情'
  | '背景'
  | '拍摄角度'
  | '光影'

const PROP_FALLBACK: Record<PropertyName, string> = {
  '人物核心': 'people_not_visible',
  '服装': 'no_clothing_visible',
  '配饰': 'no_accessories_visible',
  '姿势': 'no_clear_pose',
  '表情': 'no_clear_expression',
  '背景': 'background_not_clear',
  '拍摄角度': 'angle_not_clear',
  '光影': 'lighting_not_clear',
}

function normTag(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[-]+/g, '_')
}

function includesAny(hay: string, needles: string[]) {
  for (const n of needles) if (hay.includes(n)) return true
  return false
}

// Note: this is a heuristic filter intended to be strict. Unknown/unclassified items are dropped.
function classifyProp(tagOrPhrase: string): PropertyName | null {
  const t = normTag(tagOrPhrase)
  if (!t) return null

  // 摄影角度（更具体的优先匹配）
  const angleKeys = [
    'close_up', 'extreme_close_up', 'upper_body', 'lower_body', 'full_body', 'portrait',
    'wide_shot', 'long_shot', 'medium_shot',
    'from_above', 'from_below', 'from_behind', 'from_side', 'side_view', 'back_view',
    'dutch_angle', 'over_the_shoulder', 'fisheye',
  ]
  if (includesAny(t, angleKeys)) return '拍摄角度'

  // 光影
  const lightKeys = [
    'backlight', 'back_lighting', 'rim_light', 'rimlighting', 'soft_lighting', 'hard_light',
    'dramatic_lighting', 'volumetric_light', 'god_rays', 'lens_flare',
    'shadow', 'shadows', 'high_contrast', 'low_contrast',
    'sunlight', 'moonlight', 'neon_light', 'spotlight',
  ]
  if (includesAny(t, lightKeys)) return '光影'

  // 表情
  const exprKeys = [
    'smile', 'smiling', 'laugh', 'laughing', 'cry', 'crying',
    'angry', 'sad', 'surprised', 'serious', 'blush', 'embarrassed',
    'grin', 'frown', 'pout', 'screaming',
  ]
  if (includesAny(t, exprKeys)) return '表情'

  // 姿势 / 动作
  const poseKeys = [
    'standing', 'sitting', 'kneeling', 'lying', 'walking', 'running', 'jumping',
    'arms_', 'hands_', 'looking_', 'gazing_', 'turning_', 'leaning',
    'pose', 'posture', 'at_table', 'on_chair', 'on_bed',
  ]
  if (includesAny(t, poseKeys)) return '姿势'

  // 配饰 / 手持物（先于服装匹配）
  const accKeys = [
    'glasses', 'sunglasses', 'shades',
    'earring', 'earrings', 'necklace', 'choker', 'bracelet', 'ring', 'watch', 'brooch',
    'bag', 'handbag', 'purse', 'backpack',
    'umbrella', 'headphones', 'earphones',
    'phone', 'camera',
    'weapon', 'sword', 'knife', 'gun', 'rifle', 'staff',
    'holding_',
  ]
  if (includesAny(t, accKeys)) return '配饰'

  // 服装（含鞋袜帽手套）
  const clothesKeys = [
    'dress', 'skirt', 'shirt', 'blouse', 'jacket', 'coat', 'hoodie', 'sweater', 'uniform',
    'kimono', 'yukata', 'cheongsam', 'suit', 'tie', 'necktie',
    'bikini', 'swimsuit', 'lingerie', 'bra', 'panties',
    'pants', 'shorts', 'jeans', 'leggings',
    'stockings', 'socks', 'shoes', 'boots', 'heels', 'sneakers',
    'glove', 'gloves',
    'hat', 'cap', 'beanie', 'beret', 'hood',
    'scarf', 'cloak', 'apron',
  ]
  if (includesAny(t, clothesKeys)) return '服装'

  // 背景 / 场景
  const bgKeys = [
    'indoors', 'outdoors', 'room', 'bedroom', 'classroom', 'kitchen', 'bathroom',
    'street', 'city', 'forest', 'beach', 'mountain', 'sky', 'sea',
    'table', 'chair', 'window', 'building',
    'day', 'night', 'sunset', 'sunrise', 'rainy', 'snowy', 'fog', 'mist',
    'background', 'wall', 'floor',
  ]
  if (includesAny(t, bgKeys)) return '背景'

  // 人物核心（放最后，避免把配饰/服装误判为核心）
  const coreExact = [
    '1girl', '2girls', '3girls', '4girls',
    '1boy', '2boys', '3boys',
    '1woman', '1man',
    'solo', 'people', 'person', 'no_person',
    'female', 'male', 'female_character', 'male_character',
    'child', 'teen', 'young', 'young_adult', 'adult', 'mature', 'middle_aged', 'elderly', 'old',
    'tanned_skin', 'tan', 'pale_skin', 'dark_skin', 'skin',
  ]
  if (coreExact.includes(t)) return '人物核心'
  if (/^\d+(girl|boy|woman|man|people|persons?|person)$/.test(t)) return '人物核心'
  if (/_hair$/.test(t) || /(^|_)hair($|_)/.test(t)) return '人物核心'
  if (/_eyes$/.test(t) || /(^|_)eyes($|_)/.test(t)) return '人物核心'
  const coreKeys = [
    'freckles', 'mole', 'beard', 'mustache',
    'horn', 'horns', 'wings', 'tail', 'fang', 'fangs', 'pointy_ears', 'animal_ears', 'cat_ears', 'fox_ears',
    'haircut', 'hairstyle', 'long_hair', 'short_hair', 'wavy_hair', 'curly_hair', 'braid', 'ponytail',
    'slim', 'curvy', 'muscular', 'petite', 'tall',
  ]
  if (includesAny(t, coreKeys)) return '人物核心'

  return null
}

function filterCommaSeparatedBySelectedProps(text: string, selectedProps: string[]) {
  const allowed = new Set<PropertyName>(
    selectedProps.filter(Boolean).map(s => String(s).trim()) as PropertyName[]
  )

  // If UI passes unknown labels, don't filter (avoid deleting everything unexpectedly).
  const knownProps: PropertyName[] = ['人物核心', '服装', '配饰', '姿势', '表情', '背景', '拍摄角度', '光影']
  const hasAnyKnown = selectedProps.some(p => knownProps.includes(p as PropertyName))
  if (!hasAnyKnown) return String(text || '').trim()

  const parts = String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const kept: string[] = []
  for (const raw of parts) {
    const prop = classifyProp(raw)
    if (!prop) continue
    if (!allowed.has(prop)) continue
    kept.push(raw)
  }

  const uniq = Array.from(new Set(kept.map(s => s.trim()).filter(Boolean)))
  if (uniq.length > 0) return uniq.join(', ')

  // Fallback to prevent empty outputs (app treats empty as error).
  for (const p of knownProps) {
    if (allowed.has(p)) return PROP_FALLBACK[p]
  }
  return String(text || '').trim()
}
