import {type ClipboardEvent, useState} from 'react'
import axios from 'axios'
import {message} from '../utils/appMessage'
import type {PreviewType} from '@uiw/react-md-editor'
import MDEditor from '@uiw/react-md-editor'
import client from '../api/client'
import {markdownEditorThemeStyle} from './MarkdownEditorTheme'
import {disallowedMarkdownElements} from './markdownSecurity'

interface MarkdownEditorProps {
  value: string
  disabled?: boolean
  height?: string | number
  placeholder?: string
  preview?: PreviewType
  onChange: (value: string) => void
}

const PASTED_IMAGE_UPLOAD_TIMEOUT_MS = 30_000

function imageFilesFromPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
  return Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
}

function fallbackImageName(index: number) {
  return `pasted-image-${Date.now()}-${index + 1}.png`
}

function pastedImageUploadErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return 'Không thể tải ảnh dán lên'
  if (error.code === 'ECONNABORTED') {
    return 'Tải ảnh lên bị quá thời gian. Vui lòng kiểm tra object storage và thử lại.'
  }
  const detail = error.response?.data
  if (detail && typeof detail === 'object') return JSON.stringify(detail)
  if (typeof detail === 'string') return detail
  return 'Không thể tải ảnh dán lên'
}

export default function MarkdownEditor({
  value,
  disabled = false,
  height = 'auto',
  placeholder = 'Viết Markdown. Dán ảnh trực tiếp bằng Ctrl+V.',
  preview = 'edit',
  onChange,
}: MarkdownEditorProps) {
  const [uploading, setUploading] = useState(false)

  const uploadImage = async (file: File, index: number) => {
    const formData = new FormData()
    formData.append('file', file, file.name || fallbackImageName(index))

    const { data } = await client.post('/attachments/', formData, {
      timeout: PASTED_IMAGE_UPLOAD_TIMEOUT_MS,
    })
    const url = String(data.file || '')
    if (!url) {
      throw new Error('Attachment response did not include a file URL')
    }
    const name = file.name || fallbackImageName(index)
    return `![${name}](${url})`
  }

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFilesFromPaste(event)
    if (!files.length) return

    event.preventDefault()
    const target = event.currentTarget
    const selectionStart = target.selectionStart ?? value.length
    const selectionEnd = target.selectionEnd ?? selectionStart
    const closeUploadingMessage = message.loading(files.length === 1 ? 'Đang tải ảnh dán lên...' : `Đang tải ${files.length} ảnh dán lên...`, 0)

    setUploading(true)
    try {
      const snippets: string[] = []
      for (let index = 0; index < files.length; index += 1) {
        snippets.push(await uploadImage(files[index], index))
      }
      const insertion = snippets.join('\n')
      const nextValue = `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`
      const nextCursor = selectionStart + insertion.length
      onChange(nextValue)
      window.requestAnimationFrame(() => {
        target.focus()
        target.selectionStart = nextCursor
        target.selectionEnd = nextCursor
      })
    } catch (error) {
      message.error(pastedImageUploadErrorMessage(error))
    } finally {
      closeUploadingMessage()
      setUploading(false)
    }
  }

  return (
    <div className="asp-markdown-preview" style={{ width: '100%', minWidth: 0, height }} data-color-mode="dark">
      <MDEditor
        value={value}
        onChange={(next) => onChange(next || '')}
        preview={preview}
        previewOptions={{
          disallowedElements: disallowedMarkdownElements,
        }}
        hideToolbar
        visibleDragbar={false}
        textareaProps={{
          disabled: disabled || uploading,
          placeholder,
          onPaste: handlePaste,
        }}
        height={height}
        style={{
          width: '100%',
          minWidth: 0,
          ...markdownEditorThemeStyle,
        }}
      />
    </div>
  )
}
