import { describe, expect, it } from 'vitest'
import { createTapTracker } from './tapGesture'

describe('tap gesture detection', () => {
  it('treats a press and release at the same point as a tap', () => {
    const tracker = createTapTracker()

    tracker.down({ pointerId: 1, clientX: 120, clientY: 300 })
    expect(tracker.up({ pointerId: 1, clientX: 122, clientY: 303 })).toBe(true)
  })

  it('ignores a vertical swipe that starts on the module', () => {
    const tracker = createTapTracker()

    tracker.down({ pointerId: 1, clientX: 120, clientY: 300 })
    tracker.move({ pointerId: 1, clientX: 121, clientY: 340 })
    tracker.move({ pointerId: 1, clientX: 122, clientY: 420 })
    expect(tracker.up({ pointerId: 1, clientX: 122, clientY: 420 })).toBe(false)
  })

  it('ignores a release far away even when no move event was observed', () => {
    const tracker = createTapTracker()

    tracker.down({ pointerId: 1, clientX: 120, clientY: 300 })
    expect(tracker.up({ pointerId: 1, clientX: 120, clientY: 640 })).toBe(false)
  })

  it('ignores a long press', () => {
    let clock = 0
    const tracker = createTapTracker({ now: () => clock })

    tracker.down({ pointerId: 1, clientX: 120, clientY: 300 })
    clock = 1_200
    expect(tracker.up({ pointerId: 1, clientX: 120, clientY: 300 })).toBe(false)
  })

  it('ignores a gesture cancelled while the page is scrolling', () => {
    const tracker = createTapTracker()

    tracker.down({ pointerId: 1, clientX: 120, clientY: 300 })
    tracker.cancel()
    expect(tracker.up({ pointerId: 1, clientX: 120, clientY: 300 })).toBe(false)
  })

  it('ignores a release from another pointer', () => {
    const tracker = createTapTracker()

    tracker.down({ pointerId: 1, clientX: 120, clientY: 300 })
    expect(tracker.up({ pointerId: 2, clientX: 120, clientY: 300 })).toBe(false)
  })
})
