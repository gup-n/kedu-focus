import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/** 窄屏判定阈值：低于该宽度时复盘卡片改为“点击进入全屏编辑”。 */
export const REVIEW_NARROW_QUERY = '(max-width: 700px)'

export function useNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia?.(REVIEW_NARROW_QUERY).matches ?? false)

  useEffect(() => {
    const query = window.matchMedia?.(REVIEW_NARROW_QUERY)
    if (!query) return
    const update = () => setIsNarrow(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  return isNarrow
}

interface ReviewFocusEditorProps {
  date: string
  title: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 复盘全屏编辑器。
 *
 * 与之前的弹窗式编辑器不同，这一层就是铺满窗口的独立编辑页：没有外边距、没有居中容器，
 * 也不读取 visualViewport 的几何数据，因此软键盘出现时外层不会缩放、上移或折叠。
 * 编辑区下方保留一段空白尾部，保证空内容也能继续下滑，后续输入的文字可以滚到键盘上方。
 */
export function ReviewFocusEditor({ date, title, placeholder, value, onChange, onCancel, onConfirm }: ReviewFocusEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    }
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    return () => {
      body.style.overflow = previous.overflow
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.width = previous.width
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
    }
  }, [])

  // 在 layout effect 中聚焦：与打开编辑层的 pointerup 处于同一个任务里，
  // 移动端浏览器才会把它当作用户手势并弹出软键盘。
  useLayoutEffect(() => {
    editorRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return <div className="review-focus-layer" role="presentation">
    <section className="review-focus-panel" role="dialog" aria-modal="true" aria-labelledby="review-focus-title">
      <header className="review-focus-head">
        <button type="button" className="review-focus-cancel" onClick={onCancel}>取消</button>
        <div>
          <p>{format(parseISO(date), 'M月d日', { locale: zhCN })}</p>
          <h2 id="review-focus-title">{title}</h2>
        </div>
        <button type="button" className="review-focus-confirm" onClick={onConfirm}>确认</button>
      </header>
      <div className="review-focus-scroll">
        <textarea
          ref={editorRef}
          className="review-focus-input"
          aria-label="复盘专注编辑框"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <div className="review-focus-tail" aria-hidden="true" />
      </div>
      <footer className="review-focus-foot">点击确认后写回复盘，并立即进入自动保存。</footer>
    </section>
  </div>
}
