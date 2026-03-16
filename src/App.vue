<script setup lang="ts">
import TopBar from './components/TopBar.vue'
import BottomBar from './components/BottomBar.vue'
import Sidebar from './components/Sidebar.vue'
import CanvasArea from './components/CanvasArea.vue'
</script>

<template>
  <div class="app-layout">
    <CanvasArea class="layer-canvas" />
    <TopBar class="layer-top" />
    <Sidebar class="layer-side" />
    <BottomBar class="layer-bottom" />
  </div>
</template>

<style scoped>
.app-layout {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* Canvas is at the very bottom */
.layer-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

/* UI elements float above */
.layer-top {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 70px;
  z-index: 20;
}

.layer-side {
  position: absolute;
  top: 70px;
  right: 0;
  height: calc(100vh - 114px);
  width: 460px;
  z-index: 15;
  overflow: hidden;
}

.layer-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 44px;
  z-index: 20;
}
</style>
