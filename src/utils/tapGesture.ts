/**
 * 点击手势判定。
 *
 * 复盘卡片在窄屏上被点击后要进入全屏编辑，但如果手指按在卡片上是为了上下滑动页面，
 * 就不能进入编辑。因此只有在“按下与抬起几乎落在同一点、且按压时间足够短”时才判定为点击。
 * 判定统一放在这里，避免各组件各自实现一套阈值。
 */

export const TAP_MOVE_TOLERANCE = 12
export const TAP_DURATION_LIMIT = 700

export interface TapPointer {
  pointerId?: number
  clientX: number
  clientY: number
}

interface TapStart extends TapPointer {
  startedAt: number
  moved: boolean
}

export interface TapTracker {
  down: (event: TapPointer) => void
  move: (event: TapPointer) => void
  up: (event: TapPointer) => boolean
  cancel: () => void
}

export interface TapTrackerOptions {
  moveTolerance?: number
  durationLimit?: number
  now?: () => number
}

function samePointer(start: TapStart, event: TapPointer) {
  return start.pointerId === undefined || event.pointerId === undefined || start.pointerId === event.pointerId
}

export function createTapTracker(options: TapTrackerOptions = {}): TapTracker {
  const moveTolerance = options.moveTolerance ?? TAP_MOVE_TOLERANCE
  const durationLimit = options.durationLimit ?? TAP_DURATION_LIMIT
  const now = options.now ?? (() => Date.now())
  let start: TapStart | undefined

  return {
    down(event) {
      start = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, startedAt: now(), moved: false }
    },
    move(event) {
      if (!start || !samePointer(start, event)) return
      const movedX = Math.abs(event.clientX - start.clientX)
      const movedY = Math.abs(event.clientY - start.clientY)
      if (movedX > moveTolerance || movedY > moveTolerance) start.moved = true
    },
    up(event) {
      const current = start
      start = undefined
      if (!current || !samePointer(current, event)) return false
      if (current.moved) return false
      const movedX = Math.abs(event.clientX - current.clientX)
      const movedY = Math.abs(event.clientY - current.clientY)
      if (movedX > moveTolerance || movedY > moveTolerance) return false
      return now() - current.startedAt <= durationLimit
    },
    cancel() {
      start = undefined
    },
  }
}
