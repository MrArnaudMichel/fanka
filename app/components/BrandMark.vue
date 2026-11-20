<script setup lang="ts">
/**
 * Fanka's mark, the launcher icon in small: a flashcard mid-flip, F on the
 * back, 繁 on the front, on a tile. Geometry from `BRAND_MARK`, shared with
 * scripts/build-brand.mjs. `large` in the sidebar, `small` in compact bars.
 */
withDefaults(defineProps<{ size?: 'small' | 'large' }>(), { size: 'small' });

const { offset, card, back, front, latin, hanzi } = BRAND_MARK;
const centre = card.width / 2;
</script>

<template>
  <span class="mark" :class="size" aria-hidden="true">
    <!-- Cropped to the cards' box (x 157–867, y 169–855) so they read at 24px. -->
    <svg viewBox="112 112 800 800">
      <g :transform="`translate(${offset.x} ${offset.y})`">
        <g :transform="`translate(${back.x} ${back.y}) skewY(${back.skewY})`">
          <rect class="back" :width="card.width" :height="card.height" :rx="card.radius" />
          <text class="latin" :x="centre" :y="latin.baseline" :font-size="latin.size" :font-weight="latin.weight">
            {{ latin.text }}
          </text>
        </g>
        <g :transform="`translate(${front.x} ${front.y}) skewY(${front.skewY})`">
          <rect class="front" :width="card.width" :height="card.height" :rx="card.radius" />
          <text class="hanzi" :x="centre" :y="hanzi.baseline" :font-size="hanzi.size" :font-weight="hanzi.weight">
            {{ hanzi.text }}
          </text>
        </g>
      </g>
    </svg>
  </span>
</template>

<style scoped>
/* --surface-inverted stays dark in both themes, like the launcher icon. */
.mark {
  flex: none;
  display: block;
  overflow: hidden;
  border-radius: var(--border-radius);
  background: var(--surface-inverted);
}
.mark svg {
  display: block;
  width: 100%;
  height: 100%;
}
.back {
  fill: var(--color-primary-base);
}
.front {
  fill: var(--color-white);
}
.latin {
  fill: var(--color-white);
  font-family: var(--font-family-display);
  text-anchor: middle;
}
.hanzi {
  fill: var(--surface-inverted);
  font-family: var(--fk-font-hanzi-serif);
  text-anchor: middle;
}
/* Kanto has no size token for an icon tile; these are the sizes the mark had. */
.small { width: 24px; height: 24px; }
.large { width: 32px; height: 32px; }
</style>
