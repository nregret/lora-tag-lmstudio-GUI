<script setup lang="ts">
import { 
  Settings, 
  User, 
  Shirt, 
  Image as ImageIcon, 
  Bot,
  Send,
  Trash2,
  Plus,
  Wand2,
  Copy,
  Download,
  X
} from 'lucide-vue-next'
import { ref, computed, watch, nextTick } from 'vue'
import { activeNodeIds, activeNodeTagContent, saveActiveNodeTags, batchInsertWord, isLocalApi, isGeneratingTags, generateTagsForActiveNodes, nodes, currentDirectoryHandle } from '../store'
import { blobToDataUrlScaled } from '../utils/image'

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

// --- Image Metadata (Panel 3) ---
interface ImageMeta {
  positive: string
  negative: string
  model: string
  steps: string
  cfg: string
  sampler: string
  seed: string
  size: string
  raw: string
}

const imageMeta = ref<ImageMeta | null>(null)
const imageMetaChunks = ref<Record<string, string> | null>(null)
const imageMetaBaseName = ref('')
const isLoadingMeta = ref(false)
const metaError = ref('')
const metaActionMsg = ref('')

// --- Chat Tool (Panel 4) ---
type ChatRole = 'user' | 'assistant'
type ChatRef = { nodeId: string; baseName: string; imageUrl: string }
type ChatMessage = {
  role: ChatRole
  content: string
  refs?: ChatRef[]
  thinking?: boolean
  ts: number
}

const LOCAL_CHAT_URL = 'http://127.0.0.1:1234/v1/chat/completions'
const chatMessages = ref<ChatMessage[]>([])
const chatInput = ref('')
const isSendingChat = ref(false)
const chatError = ref('')
const chatScrollRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<HTMLTextAreaElement | null>(null)
const chatRefs = ref<ChatRef[]>([])
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionAnchor = ref(-1)
const mentionActiveIndex = ref(0)
const chatStatusLabel = computed(() => (isLocalApi.value ? '本地' : '仅本地'))

async function nodeImageUrlToDataUrl(imageUrl: string) {
  const res = await fetch(imageUrl)
  const blob = await res.blob()
  return blobToDataUrlScaled(blob, { maxSide: 768, mime: 'image/jpeg', quality: 0.85 })
}

function updateMentionState() {
  const el = chatInputRef.value
  if (!el) return
  const text = chatInput.value
  const pos = el.selectionStart ?? text.length
  const before = text.slice(0, pos)
  const at = before.lastIndexOf('@')
  if (at === -1) {
    mentionOpen.value = false
    mentionQuery.value = ''
    mentionAnchor.value = -1
    return
  }
  const prev = at > 0 ? before[at - 1] : ' '
  if (prev && !/\s/.test(prev)) {
    // avoid emails/words like a@b
    mentionOpen.value = false
    return
  }
  const q = before.slice(at + 1)
  if (q.includes(' ') || q.includes('\n') || q.includes('\t')) {
    mentionOpen.value = false
    return
  }
  mentionOpen.value = true
  mentionQuery.value = q
  mentionAnchor.value = at
  mentionActiveIndex.value = 0
}

function closeMentions() {
  mentionOpen.value = false
  mentionQuery.value = ''
  mentionAnchor.value = -1
  mentionActiveIndex.value = 0
}

const mentionCandidates = computed(() => {
  const q = mentionQuery.value.trim().toLowerCase()
  const imgs = nodes.value
    .filter(n => typeof (n as any).imageUrl === 'string' && (n as any).imageUrl)
    .map(n => ({ nodeId: String((n as any).id), baseName: String((n as any).baseName || ''), imageUrl: String((n as any).imageUrl) }))
    .filter(n => n.baseName)

  if (!q) return imgs.slice(0, 8)
  return imgs.filter(n => n.baseName.toLowerCase().includes(q)).slice(0, 8)
})

function selectMention(idxOrNode: number | { nodeId: string; baseName: string; imageUrl: string }) {
  const node =
    typeof idxOrNode === 'number'
      ? mentionCandidates.value[idxOrNode]
      : idxOrNode

  if (!node) return
  if (!chatRefs.value.some(r => r.nodeId === node.nodeId)) chatRefs.value.push(node)

  const el = chatInputRef.value
  if (el && mentionAnchor.value !== -1) {
    const pos = el.selectionStart ?? chatInput.value.length
    const before = chatInput.value.slice(0, mentionAnchor.value)
    const after = chatInput.value.slice(pos)
    // We keep the reference as a chip; remove the "@query" text from input.
    chatInput.value = before + after
    nextTick(() => {
      const caret = before.length
      el.focus()
      el.setSelectionRange(caret, caret)
      updateMentionState()
    })
  }

  closeMentions()
}

function removeRef(nodeId: string) {
  chatRefs.value = chatRefs.value.filter(r => r.nodeId !== nodeId)
}

function clearRefs() {
  chatRefs.value = []
}

function clearChat() {
  chatMessages.value = []
  chatInput.value = ''
  clearRefs()
  chatError.value = ''
  closeMentions()
}

async function scrollChatToBottom() {
  await nextTick()
  const el = chatScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

async function sendChat() {
  chatError.value = ''
  if (!isLocalApi.value) {
    chatError.value = '当前仅实现本地端（请在设置里切换到“本地 API”）'
    return
  }
  const text = chatInput.value.trim()
  const hasRefs = chatRefs.value.length > 0
  if (!text && !hasRefs) return
  const refsSnapshot = chatRefs.value.slice()

  chatMessages.value.push({
    role: 'user',
    content: text || (hasRefs ? '（引用了图片）' : ''),
    refs: refsSnapshot.length ? refsSnapshot : undefined,
    ts: Date.now()
  })
  await scrollChatToBottom()
  clearRefs()
  closeMentions()

  isSendingChat.value = true
  try {
    const history = chatMessages.value.slice(-12).map(m => ({ role: m.role, content: m.content }))
    const messages: any[] = [{ role: 'system', content: '你是一个简洁、可靠的助手。' }, ...history]

    // If there are referenced images, always try to send them.
    if (refsSnapshot.length) {
      const last = messages[messages.length - 1]
      const maxImages = 4
      const refs = refsSnapshot.slice(0, maxImages)
      const dataUrls: string[] = []
      for (const r of refs) {
        dataUrls.push(await nodeImageUrlToDataUrl(r.imageUrl))
      }
      const more = refsSnapshot.length > maxImages ? `（仅发送前 ${maxImages} 张引用图）\n` : ''
      messages[messages.length - 1] = {
        role: 'user',
        content: [
          { type: 'text', text: `${more}${last.content || '请结合图片回答：'}` },
          ...dataUrls.map(url => ({ type: 'image_url', image_url: { url } }))
        ]
      }
    }

    const payload = {
      model: 'local-model',
      messages,
      temperature: 0.7,
      max_tokens: 800,
      stream: true
    }

    const res = await fetch(LOCAL_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      let errText = ''
      try { errText = JSON.stringify(await res.json()) } catch { errText = await res.text() }
      throw new Error(errText || res.statusText)
    }

    const assistantMsg: ChatMessage = { role: 'assistant', content: '', ts: Date.now() }
    if (isLocalApi.value) assistantMsg.thinking = true
    chatMessages.value.push(assistantMsg)
    await scrollChatToBottom()

    const extractNonStreamText = (data: any) => {
      const choice0 = data?.choices?.[0]
      const content = choice0?.message?.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .map((b: any) => (typeof b?.text === 'string' ? b.text : typeof b?.content === 'string' ? b.content : ''))
          .filter(Boolean)
          .join('')
      }
      if (typeof choice0?.text === 'string') return choice0.text
      if (typeof data?.output_text === 'string') return data.output_text
      if (typeof data?.content === 'string') return data.content
      return ''
    }

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const typewriter = async (full: string) => {
      assistantMsg.thinking = false
      const chunkSize = 10
      for (let i = 0; i < full.length; i += chunkSize) {
        assistantMsg.content += full.slice(i, i + chunkSize)
        await scrollChatToBottom()
        await sleep(12)
      }
    }

    const reader = res.body?.getReader()
    if (!reader) {
      // Fallback when body can't be streamed
      const data = await res.json()
      const answer = extractNonStreamText(data).trim()
      if (answer) await typewriter(answer)
      else assistantMsg.content = '（无内容）'
      chatInput.value = ''
      await scrollChatToBottom()
      await nextTick()
      chatInputRef.value?.focus()
      return
    }
    const decoder = new TextDecoder('utf-8')
    let buf = ''
    let rawAll = ''
    let receivedAnyPiece = false
    let doneSeen = false

    const extractPiece = (evt: any) => {
      const choice0 = evt?.choices?.[0]
      const delta = choice0?.delta
      const piece =
        (typeof delta?.content === 'string' && delta.content) ||
        (typeof delta?.text === 'string' && delta.text) ||
        (typeof choice0?.message?.content === 'string' && choice0.message.content) ||
        // some servers stream "response" style
        (typeof evt?.output_text === 'string' && evt.output_text) ||
        ''
      return piece
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunkText = decoder.decode(value, { stream: true })
      rawAll += chunkText
      buf += chunkText
      buf = buf.replace(/\r\n/g, '\n')

      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        if (line.startsWith(':')) continue // keep-alive
        if (line.startsWith('event:')) continue

        let payloadStr = ''
        if (line.startsWith('data:')) {
          payloadStr = line.slice(5).trim()
          if (payloadStr === '[DONE]') { doneSeen = true; continue }
        } else if (line.startsWith('{') || line.startsWith('[')) {
          // NDJSON-style streaming (or mislabelled content-type)
          payloadStr = line
        } else {
          continue
        }

        try {
          const evt = JSON.parse(payloadStr)
          const piece = extractPiece(evt)
          if (piece) {
            receivedAnyPiece = true
            if (assistantMsg.thinking) assistantMsg.thinking = false
            assistantMsg.content += piece
          }
        } catch {
          // ignore malformed chunks
        }
      }
      await scrollChatToBottom()
    }

    // Final fallback: if we got nothing, try parse whole body as JSON and "typewriter" it.
    if (!receivedAnyPiece) {
      const trimmed = rawAll.trim()
      if (trimmed.startsWith('{')) {
        try {
          const data = JSON.parse(trimmed)
          const answer = extractNonStreamText(data).trim()
          if (answer) {
            assistantMsg.content = ''
            await typewriter(answer)
            receivedAnyPiece = true
          }
        } catch {
          // ignore
        }
      }
    }

    // Retry once with non-stream if streaming produced nothing (LM Studio sometimes buffers/mislabels)
    if (!receivedAnyPiece) {
      try {
        const retryPayload = { ...payload, stream: false }
        const retryRes = await fetch(LOCAL_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(retryPayload)
        })
        if (retryRes.ok) {
          const data = await retryRes.json()
          const answer = extractNonStreamText(data).trim()
          if (answer) {
            assistantMsg.content = ''
            await typewriter(answer)
            receivedAnyPiece = true
          }
        }
      } catch {
        // ignore
      }
    }

    assistantMsg.thinking = false
    assistantMsg.content = assistantMsg.content.trim() || '（无内容）'
    chatInput.value = ''
    await scrollChatToBottom()
    await nextTick()
    chatInputRef.value?.focus()
  } catch (e) {
    const msg = (e as Error).message || ''
    if (/image|vision|multimodal|modalit|image_url|content.*array|unsupported/i.test(msg)) {
      chatError.value = '当前模型不支持图片上传（请更换支持视觉的模型，或只发文字）'
    } else {
      chatError.value = '请求失败：' + msg
    }
  } finally {
    isSendingChat.value = false
    await nextTick()
    chatInputRef.value?.focus()
  }
}

function decodeUtf8OrLatin1(data: Uint8Array) {
  const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(data)
  return asUtf8.includes('\uFFFD') ? new TextDecoder('latin1').decode(data) : asUtf8
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = (globalThis as any).DecompressionStream as
    | undefined
    | (new (format: string) => TransformStream<Uint8Array, Uint8Array>)

  if (!DecompressionStreamCtor) {
    throw new Error('当前环境不支持解压缩 PNG 压缩元数据（iTXt/zTXt），请使用较新的 Chromium 内核浏览器')
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStreamCtor('deflate'))
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

/** Read raw tEXt / zTXt / iTXt chunks from a PNG ArrayBuffer */
async function readPngTextChunks(buf: ArrayBuffer): Promise<Record<string, string>> {
  const view = new DataView(buf)
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== PNG_SIG[i]) return {}
  }
  const dec = new TextDecoder('latin1')
  const decUtf8 = new TextDecoder('utf-8')
  const result: Record<string, string> = {}
  let offset = 8
  while (offset + 12 <= buf.byteLength) {
    const len = view.getUint32(offset)
    const type = dec.decode(new Uint8Array(buf, offset + 4, 4))
    if (type === 'IEND') break
    if (type === 'tEXt' && len > 0) {
      const data = new Uint8Array(buf, offset + 8, len)
      const nil = data.indexOf(0)
      if (nil !== -1) {
        const key = dec.decode(data.slice(0, nil))
        const val = dec.decode(data.slice(nil + 1))
        result[key] = val
      }
    } else if (type === 'zTXt' && len > 0) {
      const data = new Uint8Array(buf, offset + 8, len)
      const nil = data.indexOf(0)
      if (nil !== -1 && nil + 2 <= data.length) {
        const key = dec.decode(data.slice(0, nil))
        const comprMethod = data[nil + 1]
        const payload = data.slice(nil + 2)
        if (comprMethod === 0) {
          const inflated = await inflateZlib(payload)
          result[key] = decodeUtf8OrLatin1(inflated)
        }
      }
    } else if (type === 'iTXt' && len > 0) {
      const data = new Uint8Array(buf, offset + 8, len)
      let pos = 0
      const nil0 = data.indexOf(0, pos)
      if (nil0 !== -1) {
        const key = dec.decode(data.slice(pos, nil0))
        pos = nil0 + 1
        const comprFlag = data[pos++]
        const comprMethod = data[pos++]
        const nil1 = data.indexOf(0, pos)
        if (nil1 === -1) { offset += 12 + len; continue }
        pos = nil1 + 1 // lang tag
        const nil2 = data.indexOf(0, pos)
        if (nil2 === -1) { offset += 12 + len; continue }
        pos = nil2 + 1 // translated kw
        const payload = data.slice(pos)
        if (comprFlag === 0) {
          result[key] = decUtf8.decode(payload)
        } else if (comprFlag === 1 && comprMethod === 0) {
          const inflated = await inflateZlib(payload)
          result[key] = decUtf8.decode(inflated)
        }
      }
    }
    offset += 12 + len
  }
  return result
}

/** Parse A1111 / NovelAI "parameters" text into structured fields */
function parseA1111(raw: string): ImageMeta {
  const lines = raw.split('\n')
  let posLines: string[] = []
  let negLines: string[] = []
  let paramLine = ''
  let inNeg = false

  for (const line of lines) {
    if (line.startsWith('Negative prompt:')) {
      inNeg = true
      negLines.push(line.replace('Negative prompt:', '').trim())
    } else if (/^Steps:\s*\d/.test(line)) {
      paramLine = line
      inNeg = false
    } else if (inNeg) {
      negLines.push(line)
    } else {
      posLines.push(line)
    }
  }

  const params: Record<string, string> = {}
  for (const part of paramLine.split(',')) {
    const idx = part.indexOf(':')
    if (idx !== -1) {
      params[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
    }
  }

  return {
    positive: posLines.join('\n').trim(),
    negative: negLines.join('\n').trim(),
    model: params['Model'] || '',
    steps: params['Steps'] || '',
    cfg: params['CFG scale'] || '',
    sampler: params['Sampler'] || '',
    seed: params['Seed'] || '',
    size: params['Size'] || '',
    raw
  }
}

type ComfyPromptNode = {
  class_type?: string
  inputs?: Record<string, any>
}

type ComfyPrompt = Record<string, ComfyPromptNode>

function parseComfyUI(chunks: Record<string, string>): ImageMeta | null {
  const rawPrompt = chunks['prompt']
  const rawWorkflow = chunks['workflow']

  if (rawPrompt) {
    try {
      const parsed = JSON.parse(rawPrompt) as unknown
      if (!parsed || typeof parsed !== 'object') throw new Error('prompt 不是对象')

      const prompt = parsed as ComfyPrompt

      const entries = Object.entries(prompt).filter(
        ([, node]) => node && typeof node === 'object' && typeof node.class_type === 'string'
      )

      const samplerEntry =
        entries.find(([, n]) => (n.class_type || '').startsWith('KSampler')) ||
        entries.find(([, n]) => (n.class_type || '').includes('Sampler'))

      const samplerInputs = samplerEntry?.[1]?.inputs || {}

      const readLinkedText = (refVal: any) => {
        if (!Array.isArray(refVal) || refVal.length < 1) return ''
        const nodeId = String(refVal[0])
        const node = prompt[nodeId]
        const text = node?.inputs?.text
        return typeof text === 'string' ? text : ''
      }

      const positive = readLinkedText(samplerInputs.positive)
      const negative = readLinkedText(samplerInputs.negative)

      const seed =
        typeof samplerInputs.seed === 'number' || typeof samplerInputs.seed === 'string' ? String(samplerInputs.seed) : ''
      const steps =
        typeof samplerInputs.steps === 'number' || typeof samplerInputs.steps === 'string' ? String(samplerInputs.steps) : ''
      const cfg =
        typeof samplerInputs.cfg === 'number' || typeof samplerInputs.cfg === 'string' ? String(samplerInputs.cfg) : ''

      const samplerName = typeof samplerInputs.sampler_name === 'string' ? samplerInputs.sampler_name : ''
      const scheduler = typeof samplerInputs.scheduler === 'string' ? samplerInputs.scheduler : ''
      const sampler = samplerName ? (scheduler ? `${samplerName} / ${scheduler}` : samplerName) : scheduler

      let model = ''
      for (const [, node] of entries) {
        const ckpt = node?.inputs?.ckpt_name
        if (typeof ckpt === 'string' && ckpt) { model = ckpt; break }
      }

      let width = ''
      let height = ''
      for (const [, node] of entries) {
        const w = node?.inputs?.width
        const h = node?.inputs?.height
        if ((typeof w === 'number' || typeof w === 'string') && (typeof h === 'number' || typeof h === 'string')) {
          width = String(w)
          height = String(h)
          break
        }
      }
      const size = width && height ? `${width}x${height}` : ''

      return {
        positive,
        negative,
        model,
        steps,
        cfg,
        sampler,
        seed,
        size,
        raw: rawPrompt
      }
    } catch {
      // fall through to workflow
    }
  }

  if (rawWorkflow) {
    return {
      positive: '',
      negative: '',
      model: '',
      steps: '',
      cfg: '',
      sampler: '',
      seed: '',
      size: '',
      raw: rawWorkflow
    }
  }

  return null
}

async function copyRawMetadata() {
  metaActionMsg.value = ''
  const raw = imageMeta.value?.raw || ''
  if (!raw) return
  try {
    await navigator.clipboard.writeText(raw)
    metaActionMsg.value = '已复制'
    setTimeout(() => (metaActionMsg.value = ''), 1200)
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = raw
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      metaActionMsg.value = '已复制'
      setTimeout(() => (metaActionMsg.value = ''), 1200)
    } catch (e) {
      metaActionMsg.value = '复制失败'
      setTimeout(() => (metaActionMsg.value = ''), 1200)
      throw e
    }
  }
}

async function exportMetadataJson() {
  metaActionMsg.value = ''
  if (!imageMetaChunks.value) return

  const payload = {
    baseName: imageMetaBaseName.value || undefined,
    chunks: imageMetaChunks.value,
    parsed: imageMeta.value,
    exportedAt: new Date().toISOString()
  }
  const json = JSON.stringify(payload, null, 2)
  const suggestedName = `${imageMetaBaseName.value || 'image'}.metadata.json`

  const savePicker = (window as any).showSaveFilePicker as
    | undefined
    | ((opts: any) => Promise<any>)

  try {
    if (savePicker) {
      const handle = await savePicker({
        suggestedName,
        types: [
          {
            description: 'JSON',
            accept: { 'application/json': ['.json'] }
          }
        ]
      })
      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      metaActionMsg.value = '已导出'
      setTimeout(() => (metaActionMsg.value = ''), 1200)
      return
    }

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    metaActionMsg.value = '已导出'
    setTimeout(() => (metaActionMsg.value = ''), 1200)
  } catch (e) {
    // User cancel is fine
    const name = (e as any)?.name
    if (name === 'AbortError') return
    metaActionMsg.value = '导出失败'
    setTimeout(() => (metaActionMsg.value = ''), 1200)
    throw e
  }
}

async function loadImageMetadata() {
  imageMeta.value = null
  imageMetaChunks.value = null
  imageMetaBaseName.value = ''
  metaError.value = ''
  if (activeNodeIds.value.length !== 1 || !currentDirectoryHandle.value) return

  const node = nodes.value.find(n => n.id === activeNodeIds.value[0])
  if (!node) return
  imageMetaBaseName.value = node.baseName

  isLoadingMeta.value = true
  try {
    // Find the image file (try common extensions)
    const exts = ['png', 'jpg', 'jpeg', 'webp', 'bmp']
    let fileHandle: any = null
    for (const ext of exts) {
      try {
        fileHandle = await currentDirectoryHandle.value.getFileHandle(`${node.baseName}.${ext}`)
        break
      } catch {}
    }
    if (!fileHandle) { metaError.value = '找不到原始图片文件'; return }

    const file: File = await fileHandle.getFile()

    // Only PNG has reliable text metadata
    if (!file.name.toLowerCase().endsWith('.png')) {
      metaError.value = '仅支持 PNG 格式的元数据解析'
      return
    }

    const buf = await file.arrayBuffer()
    const chunks = await readPngTextChunks(buf)
    imageMetaChunks.value = chunks
    const a1111Raw = chunks['parameters'] || chunks['Comment'] || chunks['Description'] || ''
    if (a1111Raw) {
      imageMeta.value = parseA1111(a1111Raw)
      return
    }

    const comfyMeta = parseComfyUI(chunks)
    if (comfyMeta) {
      imageMeta.value = comfyMeta
      return
    }

    const keys = Object.keys(chunks)
    metaError.value = keys.length
      ? `图片包含元数据，但未找到可识别字段（A1111 parameters 或 ComfyUI prompt/workflow）。现有字段：${keys.join(', ')}`
      : '图片中未包含可识别的元数据'
  } catch (e) {
    metaError.value = '读取元数据失败: ' + (e as Error).message
  } finally {
    isLoadingMeta.value = false
  }
}

// Load metadata whenever panel 3 is active and selection changes
watch([activeTool, activeNodeIds], ([tool]) => {
  if (tool === 2) loadImageMetadata()
})

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

      <!-- ============ IMAGE METADATA PANEL ============ -->
      <template v-else-if="activeTool === 2">
        <div class="header">
          <div class="title-row">
            <div class="title-with-icon">
              <ImageIcon :size="20" color="var(--primary)" />
              <h2>图片信息</h2>
            </div>
            <div class="tag-count-badge" v-if="imageMeta">
              {{ imageMeta.size || '—' }}
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="content-scroll">
          <!-- Loading -->
          <div v-if="isLoadingMeta" class="tag-empty-state">
            <span class="loading-spinner"></span>
            <span>读取中...</span>
          </div>

          <!-- No image selected -->
          <div v-else-if="activeNodeIds.length === 0" class="tag-empty-state">
            <ImageIcon :size="36" class="empty-icon" />
            <span>请在画布上选择一张图片</span>
          </div>

          <!-- Multi-select -->
          <div v-else-if="activeNodeIds.length > 1" class="tag-empty-state">
            <ImageIcon :size="36" class="empty-icon" />
            <span>已选中 <strong style="color: var(--primary);">{{ activeNodeIds.length }}</strong> 张图片</span>
          </div>

          <!-- Error -->
          <div v-else-if="metaError" class="tag-empty-state">
            <ImageIcon :size="36" class="empty-icon" />
            <span class="meta-error">{{ metaError }}</span>
          </div>

          <!-- Metadata display -->
          <div v-else-if="imageMeta" class="meta-panel">
            <!-- Stat grid: model / steps / cfg / sampler / seed -->
            <div class="meta-stat-grid">
              <div class="meta-stat" v-if="imageMeta.model">
                <span class="meta-stat-label">模型</span>
                <span class="meta-stat-value">{{ imageMeta.model }}</span>
              </div>
              <div class="meta-stat" v-if="imageMeta.sampler">
                <span class="meta-stat-label">采样器</span>
                <span class="meta-stat-value">{{ imageMeta.sampler }}</span>
              </div>
              <div class="meta-stat" v-if="imageMeta.steps">
                <span class="meta-stat-label">步数</span>
                <span class="meta-stat-value">{{ imageMeta.steps }}</span>
              </div>
              <div class="meta-stat" v-if="imageMeta.cfg">
                <span class="meta-stat-label">CFG</span>
                <span class="meta-stat-value">{{ imageMeta.cfg }}</span>
              </div>
              <div class="meta-stat" v-if="imageMeta.seed">
                <span class="meta-stat-label">Seed</span>
                <span class="meta-stat-value meta-mono">{{ imageMeta.seed }}</span>
              </div>
            </div>

            <!-- Positive prompt -->
            <div class="meta-block" v-if="imageMeta.positive">
              <div class="meta-block-label positive-label">正向提示词</div>
              <div class="meta-block-content glass-inset">{{ imageMeta.positive }}</div>
            </div>

            <!-- Negative prompt -->
            <div class="meta-block" v-if="imageMeta.negative">
              <div class="meta-block-label negative-label">反向提示词</div>
              <div class="meta-block-content glass-inset negative-content">{{ imageMeta.negative }}</div>
            </div>

            <!-- Raw metadata -->
            <div class="meta-block" v-if="imageMeta.raw">
              <div class="meta-block-label meta-block-label-row">
                <span>原始元数据</span>
                <span class="meta-actions">
                  <span v-if="metaActionMsg" class="meta-action-msg">{{ metaActionMsg }}</span>
                  <button class="meta-action-btn" type="button" title="复制到剪切板" @click="copyRawMetadata">
                    <Copy :size="14" />
                  </button>
                  <button class="meta-action-btn" type="button" title="导出为 JSON" @click="exportMetadataJson">
                    <Download :size="14" />
                  </button>
                </span>
              </div>
              <pre class="meta-block-content glass-inset meta-raw">{{ imageMeta.raw }}</pre>
            </div>
          </div>
        </div>
      </template>

      <!-- ============ CHAT PANEL ============ -->
      <template v-else-if="activeTool === 3">
        <div class="header">
          <div class="title-row">
            <div class="title-with-icon">
              <Bot :size="20" color="var(--primary)" />
              <h2>AI 对话</h2>
            </div>
            <div class="tag-count-badge">
              {{ chatStatusLabel }}
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="content-scroll chat-scroll" ref="chatScrollRef">
          <div v-if="chatMessages.length === 0" class="tag-empty-state">
            <Bot :size="36" class="empty-icon" />
            <span>连接到本地模型（LM Studio / OpenAI 兼容接口）</span>
            <span style="font-size: 12px; color: var(--text-light); margin-top: 6px;">
              端口：127.0.0.1:1234（仅本地 API）
            </span>
          </div>

          <div v-else class="chat-list">
            <div v-for="m in chatMessages" :key="m.ts + '-' + m.role" class="chat-msg" :class="m.role">
              <div class="chat-bubble glass-card">
                <div class="chat-text">{{ m.content }}</div>
                <div v-if="m.role === 'assistant' && m.thinking && !m.content" class="chat-thinking" aria-label="thinking">
                  <span class="thinking-dot"></span>
                  <span class="thinking-dot"></span>
                  <span class="thinking-dot"></span>
                </div>
                <div v-if="m.refs && m.refs.length" class="chat-msg-refs">
                  <span v-for="r in m.refs" :key="r.nodeId" class="chat-msg-ref" :title="r.baseName">
                    <img :src="r.imageUrl" class="chat-msg-ref-img" />
                    <span class="chat-msg-ref-name">{{ r.baseName }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="actions-area chat-actions">
          <div class="chat-top-actions">
            <button class="meta-action-btn" type="button" title="清空对话" @click="clearChat">
              <Trash2 :size="14" />
            </button>
          </div>

          <div v-if="chatError" class="chat-error">{{ chatError }}</div>

          <div class="chat-composer glass-inset">
            <div v-if="chatRefs.length" class="chat-chip-row">
              <span v-for="r in chatRefs" :key="r.nodeId" class="chat-chip glass-card" :title="r.baseName">
                <img :src="r.imageUrl" class="chat-chip-img" />
                <span class="chat-chip-name">{{ r.baseName }}</span>
                <button class="chat-chip-x" type="button" title="移除引用" @click="removeRef(r.nodeId)">
                  <X :size="12" />
                </button>
              </span>
            </div>

            <div class="chat-input-row">
              <textarea
                ref="chatInputRef"
                class="chat-input"
                v-model="chatInput"
                :disabled="isSendingChat || !isLocalApi"
                placeholder="输入消息，Enter 发送（Shift+Enter 换行）。输入 @ 可引用画布图片"
                rows="2"
                @input="updateMentionState"
                @click="updateMentionState"
                @keyup="updateMentionState"
                @keydown.down.prevent="mentionOpen && (mentionActiveIndex = Math.min(mentionActiveIndex + 1, mentionCandidates.length - 1))"
                @keydown.up.prevent="mentionOpen && (mentionActiveIndex = Math.max(mentionActiveIndex - 1, 0))"
                @keydown.enter.exact.prevent="sendChat"
                @keydown.enter.shift.stop
                @keydown.tab.prevent="mentionOpen && selectMention(mentionActiveIndex)"
                @keydown.esc.prevent="closeMentions"
              ></textarea>

              <button class="btn-primary chat-send" :disabled="isSendingChat || (!chatInput.trim() && chatRefs.length === 0) || !isLocalApi" @click="sendChat">
                <Send :size="16" />
              </button>
            </div>

            <div v-if="mentionOpen" class="chat-mention glass-card">
              <div
                v-for="(c, idx) in mentionCandidates"
                :key="c.nodeId"
                class="chat-mention-item"
                :class="{ active: idx === mentionActiveIndex }"
                @mousedown.prevent="selectMention(c)"
              >
                <img :src="c.imageUrl" class="chat-mention-img" />
                <div class="chat-mention-name">{{ c.baseName }}</div>
              </div>
              <div v-if="mentionCandidates.length === 0" class="chat-mention-empty">
                未找到可引用的图片（请先在画布上放入图片节点）
              </div>
            </div>
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
      <button class="tool-btn glass-card" :class="{ active: activeTool === 3 }" @click="activeTool = 3" title="对话">
        <Bot :size="18" />
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

/* ====== Image Metadata Panel ====== */
.meta-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 16px;
}

.meta-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.meta-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid var(--glass-border-light);
  border-radius: 10px;
  padding: 10px 12px;
}

/* model / sampler spans full row */
.meta-stat:first-child,
.meta-stat:nth-child(2) {
  grid-column: span 2;
}

.meta-stat-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-light);
}

.meta-stat-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  word-break: break-all;
}

.meta-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.meta-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-block-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.meta-block-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.meta-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.meta-action-msg {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--text-light);
}

.meta-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  border-radius: 8px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.45);
  color: var(--text-muted);
  cursor: pointer;
}

.meta-action-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.65);
}

.positive-label {
  color: #10b981;  /* green */
}

.negative-label {
  color: #ef4444;  /* red */
}

.meta-block-content {
  padding: 12px 14px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
}

.negative-content {
  color: var(--text-muted);
}

.meta-raw {
  max-height: 260px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.meta-error {
  color: var(--danger);
  font-size: 13px;
  text-align: center;
}

/* ====== Chat Panel ====== */
.chat-scroll {
  padding: 0 18px;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 14px;
}

.chat-msg {
  display: flex;
}

.chat-msg.user {
  justify-content: flex-end;
}

.chat-msg.assistant {
  justify-content: flex-start;
}

.chat-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.65);
}

.chat-msg.user .chat-bubble {
  background: rgba(46, 182, 255, 0.12);
  border-color: rgba(46, 182, 255, 0.25);
}

.chat-img {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
}

.chat-text {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-main);
}

.chat-thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 2px 2px;
}

.thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-light);
  opacity: 0.35;
  animation: thinkingPulse 1.1s infinite ease-in-out;
}

.thinking-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.thinking-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes thinkingPulse {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-2px); opacity: 0.9; }
}

.chat-msg-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.chat-msg-ref {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.55);
}

.chat-msg-ref-img {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--glass-border-light);
}

.chat-msg-ref-name {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-main);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-top-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.chat-error {
  color: var(--danger);
  font-size: 12.5px;
  text-align: left;
  padding: 0 2px;
}

.chat-attach-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.chat-attach-img {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.6);
}

.chat-attach-note {
  flex: 1;
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.4;
}

.chat-composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 10px 12px;
}

.chat-chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.chat-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.65);
}

.chat-chip-img {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--glass-border-light);
}

.chat-chip-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-chip-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.45);
  color: var(--text-muted);
  cursor: pointer;
}

.chat-chip-x:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.7);
}

.chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.chat-input {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-main);
  min-height: 56px;
  line-height: 1.5;
  padding: 6px 6px;
}

.chat-send {
  width: 44px;
  height: 44px;
  padding: 0 !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-mention {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(100% + 8px);
  max-height: 240px;
  overflow: auto;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 30px rgba(0,0,0,0.12);
  z-index: 200;
}

.chat-mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  cursor: pointer;
}

.chat-mention-item:hover,
.chat-mention-item.active {
  background: rgba(46, 182, 255, 0.10);
}

.chat-mention-img {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--glass-border-light);
  background: rgba(255, 255, 255, 0.6);
}

.chat-mention-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-main);
}

.chat-mention-empty {
  padding: 10px 12px;
  font-size: 12.5px;
  color: var(--text-light);
  text-align: center;
}
</style>
