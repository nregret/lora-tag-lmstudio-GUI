<script setup lang="ts">
import { Hexagon, Cloud, Moon, Settings, Monitor } from 'lucide-vue-next'
</script>

<template>
  <header class="topbar glass-bar">
    <!-- Left: Logo -->
    <div class="logo">
      <div class="logo-icon">
        <Hexagon :size="20" color="var(--primary)" />
      </div>
      <span class="logo-text">TagMaster Pro</span>
    </div>

    <!-- Center: Navigation -->
    <nav class="nav-links">
      <a href="#" class="nav-item">PROJECTS</a>
      <a href="#" class="nav-item active">DATASET</a>
      <a href="#" class="nav-item">TRAINING</a>
      <a href="#" class="nav-item">NODES</a>
    </nav>

    <!-- Right: Actions -->
    <div class="actions">
      <div class="sync-badge">
        <Cloud :size="14" class="sync-icon" />
        <span>CLOUD SYNC ACTIVE</span>
      </div>
      
      <button class="icon-btn glass-card">
        <Moon :size="16" />
      </button>
      <button class="icon-btn glass-card">
        <Settings :size="16" />
      </button>
      <button class="icon-btn glass-card" style="color: #fca5a5;">
        <Monitor :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped>
/* Topbar Styles */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--glass-shadow-sm);
  border: 1px solid var(--glass-border-light);
}

.logo-text {
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -0.5px;
  color: var(--text-main);
}

.nav-links {
  display: flex;
  gap: 32px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  height: 100%;
}

.nav-item {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  display: flex;
  align-items: center;
  height: 100%;
  position: relative;
  transition: color 0.2s ease;
}

.nav-item:hover {
  color: var(--text-main);
}

.nav-item.active {
  color: var(--primary);
}

.nav-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background-color: var(--primary);
  border-radius: 3px 3px 0 0;
  box-shadow: 0 -2px 8px rgba(46, 182, 255, 0.5);
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sync-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(220, 240, 255, 0.7);
  color: var(--primary);
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  border: 1px solid rgba(46, 182, 255, 0.15);
  margin-right: 12px;
}

.sync-icon {
  stroke-width: 2.5px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%; /* circular buttons */
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.icon-btn:hover {
  color: var(--primary);
  transform: translateY(-1px);
  box-shadow: var(--glass-shadow-lg);
}
</style>
