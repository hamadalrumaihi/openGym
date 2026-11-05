---
name: apple-motion
description: >
  Apple's two motion rules for anything that moves on screen: springs instead of timed curves, and
  the rubber band when something is pulled past its end. Use it whenever you add or change an
  animation, transition, drag, swipe, sheet, drawer, slider, carousel, toggle, sliding indicator,
  pull-to-refresh, overscroll or any gesture that moves an element, and when reviewing motion that
  feels stiff, restarts when interrupted, or stops dead at a hard limit.
---

# Apple motion: springs and the rubber band

Two rules from how iOS feels in the hand. Before writing code, look for the project's own motion
helpers (a `motion` module, duration and easing tokens) and design rules, reuse them, and let them
win where they conflict with this skill. If there are none, create one `motion` module for the
helpers below rather than scattering copies.

## 1. Everything that moves is a spring

A timed animation (`transition: 200ms ease-out`, `withTiming`, a keyframe) runs on a fixed path for a
fixed length. Change the target halfway and it throws the old animation away and starts again from
rest, so a toggle flicked twice jerks.

Apple drives motion with damped harmonic springs. A spring only knows where it is, how fast it is
going, and where it is heading. Retarget it mid-flight and it turns round from where it is, carrying
its speed, like something held in the hand. Every spring is the same physics; only the friction
(damping) changes.

- **Use a spring** for anything that changes position, size, rotation or scale, and especially
  anything the user can interrupt: toggles, switch thumbs, drawers, sheets, sidebars, sliding tab
  indicators, progress, reordering, swipe-to-reveal, drag-and-release.
- **Hand the gesture's release velocity to the spring**, so a flick carries on at the speed the
  finger left it. Convert units: React Native's `PanResponder` gives px per ms (multiply by 1000),
  springs take units per second.
- **Damping ratio** chooses the feel. Apple's SwiftUI presets all last about 0.5 s:

  | Feel | Damping ratio | Use for |
  | --- | --- | --- |
  | `.smooth` | 1 (critically damped, no overshoot) | the default, calm interfaces |
  | `.snappy` | 0.85 | quick, slightly lively |
  | `.bouncy` | 0.7 | playful moments only |

  Stay at 1 unless the project's design rules ask for life. Below 0.7 reads as a toy.
- **Keep timed curves** for things that don't travel and can't be grabbed: fades, colour changes,
  entrance and exit choreography, skeleton shimmer, spinners, celebration sequences.
- **Reduced motion:** when the user asks for less motion, set the final value directly. No spring.

## 2. Pulled past its end, it gives like a rubber band

When a drag goes past a limit, don't stop dead and don't follow the finger 1:1. iOS uses:

```
offset = (1 − 1 / (c · x / d + 1)) · d
```

- `x` is how far past the limit the finger has pulled.
- `d` is the dimension in the pull's axis: the screen or scroll view for a page, the element's own
  width or height for a smaller thing.
- `c = 0.55` (UIKit's `TouchRubberBandingCoefficient`).

The further you pull, the less it follows, and it can never pass one `d` however far you drag. On
release, spring back to the limit with the release velocity.

| Pull past end (d = 800) | 100 | 400 | 800 | 4000 |
| --- | --- | --- | --- | --- |
| Moves | 51 | 173 | 284 | 587 |

- **Apply it to hand-driven drags you own:** swipe rows past their actions, sheets pulled past
  open, toasts pulled the wrong way, carousels past the first or last item, sliders and handles past
  their range.
- **Don't re-implement native scrolling.** iOS scroll views already bounce with this formula. On the
  web and Android, don't hijack page scroll to fake it.
- A resize handle that must stop at a hard size limit can stay clamped.

## Code

### The rubber band (any stack)

```ts
export const RUBBER_BAND_COEFFICIENT = 0.55;

/** How far a thing moves when pulled `pull` past its end, given its size `dimension`. */
export function rubberBand(pull: number, dimension: number, coefficient = RUBBER_BAND_COEFFICIENT) {
  "worklet"; // harmless on the web; lets Reanimated run it on the UI thread
  if (dimension <= 0 || pull === 0) return 0;
  const offset = (1 - 1 / ((coefficient * Math.abs(pull)) / dimension + 1)) * dimension;
  return pull < 0 ? -offset : offset;
}

/** `value` followed 1:1 between `min` and `max`, rubber-banded beyond them. */
export function rubberBanded(value: number, min: number, max: number, dimension: number) {
  "worklet";
  if (value > max) return max + rubberBand(value - max, dimension);
  if (value < min) return min - rubberBand(min - value, dimension);
  return value;
}
```

Test it: 0 at 0, sign kept, each extra pixel moves less than the last, never reaches `dimension`.

### Springs in React Native (Reanimated 3+)

`withSpring` keeps velocity when a new target arrives mid-flight. `withTiming` does not.

```ts
const spring = (ms: number, velocity = 0): WithSpringConfig => ({ duration: ms, dampingRatio: 1, velocity });

x.value = reduceMotion ? to : withSpring(to, spring(180));                     // a toggle
x.value = withSpring(to, spring(180, gesture.vx * 1000));                     // after a flick
layout = LinearTransition.springify(180).dampingRatio(1);                      // layout moves
```

### Springs on the web, without a library

CSS transitions restart their timing when interrupted and drop velocity. For movement the user can
interrupt, drive the value from a spring. This is Apple's parameterisation (response in seconds,
damping ratio), integrated per frame:

```ts
type SpringOptions = { response?: number; dampingRatio?: number };

/** A value that springs towards its target and can be retargeted mid-flight, keeping its speed. */
export function createSpring(initial: number, onUpdate: (value: number) => void,
  { response = 0.35, dampingRatio = 1 }: SpringOptions = {}) {
  const stiffness = ((2 * Math.PI) / response) ** 2;
  const damping = (4 * Math.PI * dampingRatio) / response;
  let value = initial, velocity = 0, target = initial, frame = 0, last = 0;

  const step = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30); // a stalled tab doesn't fling it
    last = now;
    for (let i = 0; i < 4; i++) {                      // substeps keep stiff springs stable
      const h = dt / 4;
      velocity += (-stiffness * (value - target) - damping * velocity) * h;
      value += velocity * h;
    }
    if (Math.abs(velocity) < 1 && Math.abs(value - target) < 0.1) {
      value = target; velocity = 0; frame = 0; onUpdate(value); return;
    }
    onUpdate(value);
    frame = requestAnimationFrame(step);
  };

  return {
    /** Spring to `next`. Pass the gesture's release velocity (units per second) after a drag. */
    to(next: number, releaseVelocity?: number) {
      target = next;
      if (releaseVelocity !== undefined) velocity = releaseVelocity;
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
    },
    /** Jump with no motion: during a drag, and under reduced motion. */
    set(next: number) {
      cancelAnimationFrame(frame); frame = 0; value = target = next; velocity = 0; onUpdate(value);
    },
    stop() { cancelAnimationFrame(frame); frame = 0; },
    get value() { return value; },
  };
}
```

- Write the value with `element.style.transform` (or a CSS custom property), not React state, so
  each frame doesn't re-render.
- Check `matchMedia("(prefers-reduced-motion: reduce)").matches` and call `set` instead of `to`.
- Release velocity from pointer events: keep the last few `{x, t}` samples from `pointermove`
  (within about 100 ms) and divide distance by time, in px per second.
- Call `stop()` on unmount.
- If the project already has an animation library with springs (Motion, react-spring), use its
  spring instead. Don't add a library just for this.

## Checklist before finishing

1. Every moving thing you touched uses a spring, and interrupting it midway turns it round smoothly.
2. Drags hand their release velocity to the spring that settles them.
3. Drags past a limit rubber-band with the thing's own size as `d`, and spring back on release.
4. Reduced motion jumps straight to the end state.
5. Fades, colour changes and choreography stayed timed.
6. Test the rubber band maths. Then watch the real interaction (toggle twice quickly, flick, pull far
   past the end) in the running app.
