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
  try {
    for (const nodeId of activeNodeIds.value) {
      const node = nodes.value.find(n => n.id === nodeId)
      if (!node) continue
      
      // Get Base64 image from Blob URL
      const response = await fetch(node.imageUrl)
      const blob = await response.blob()
      const base64data = await blobToDataUrlScaled(blob, { maxSide: 768, mime: 'image/jpeg', quality: 0.85 })

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

      // API Call
      const apiUrl = isLocalApi.value 
        ? 'http://127.0.0.1:1234/v1/chat/completions' 
        : 'https://api.openai.com/v1/chat/completions' // Placeholder for cloud
      
      const apiPayload = {
        model: "local-model", // LMStudio usually ignores model name, or matches whatever is loaded
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

      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      // If using cloud, you might need an API Key
      if (!isLocalApi.value) {
        // reqHeaders['Authorization'] = `Bearer YOUR_CLOUD_API_KEY`
      }

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

      // Save to file overwriting previous content
      const txtFileName = node.baseName + '.txt'
      const fileHandle = await currentDirectoryHandle.value.getFileHandle(txtFileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(generatedText)
      await writable.close()

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
  }
}
