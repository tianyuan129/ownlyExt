<template>
  <Teleport to="body" v-if="opened">
    <div class="dropdown-backdrop" @click.stop.prevent="close" @contextmenu.stop.prevent="close">
      <div class="dropdown is-active" :style="{ top: `${coords.y}px`, left: `${coords.x}px` }">
        <div class="dropdown-menu" role="menu">
          <div class="dropdown-content">
            <slot></slot>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits(['close']);
defineExpose({ open });

const coords = ref({ x: 0, y: 0 });
const opened = ref(false);

function open(event: MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
  const x = Math.max(event.clientX, 200);
  const y = event.clientY + 5;
  coords.value = { x, y };
  opened.value = true;
}

function close() {
  opened.value = false;
  emit('close');
}
</script>

<style lang="scss" scoped>
.dropdown-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 100vw;
  z-index: var(--z-dropdown);

  .dropdown {
    z-index: calc(var(--z-dropdown) + 1);
  }

  .dropdown-content {
    user-select: none;
    transform: translateX(calc(-100% + 20px));
    box-shadow: 0px 0px 7px 2px rgba(0, 0, 0, 0.5);
  }
}
</style>
