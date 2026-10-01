<script setup lang="ts">
// Compact activity timeline: time | ring dot | text (Fox "Daily Activities").
// v-timeline cannot put the time column this close to the dot, so it is custom.
import type { TimelineItem } from '@/types'

defineProps<{ items: TimelineItem[] }>()
defineSlots<{ item?: (props: { item: TimelineItem; index: number }) => any }>()
</script>

<template>
  <ol class="fox-timeline">
    <li v-for="(item, i) in items" :key="i" class="fox-timeline__item">
      <span class="fox-timeline__time text-body-2 fox-num">{{ item.time }}</span>
      <span class="fox-timeline__dot" :class="`text-${item.tone || 'primary'}`" />
      <div class="fox-timeline__content text-body-1">
        <slot name="item" :item="item" :index="i">
          {{ item.text }}
          <a v-if="item.highlight" href="#" class="text-primary font-weight-medium text-decoration-none" @click.prevent>
            {{ item.highlight }}
          </a>
        </slot>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.fox-timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.fox-timeline__item {
  position: relative;
  display: grid;
  grid-template-columns: 48px 12px 1fr;
  column-gap: 16px;
  padding-bottom: 20px;
}

.fox-timeline__item:last-child {
  padding-bottom: 0;
}

/* connector line between dots */
.fox-timeline__item:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 20px;
  bottom: 0;
  left: calc(48px + 16px + 5px);
  width: 2px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
}

.fox-timeline__time {
  padding-top: 1px;
  color: rgb(var(--v-theme-on-surface));
}

.fox-timeline__dot {
  width: 12px;
  height: 12px;
  margin-top: 5px;
  border: 2px solid currentColor;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
}

.fox-timeline__content {
  min-width: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
