import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'child_process'
import os from 'os'

let cachedHwInfo: string | null = null;

export const hwInfoPlugin = () => {
  return {
    name: 'hw-info-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/hwinfo', (_req: any, res: any) => {
        if (!cachedHwInfo) {
          let gpu = 'Unknown GPU';
          let vram = '';
          try {
            const smi = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { encoding: 'utf-8', stdio: 'pipe' });
            const parts = smi.trim().split(',');
            if (parts.length >= 2) {
              gpu = parts[0].trim();
              const vramMiB = parseInt(parts[1].trim());
              vram = Math.ceil(vramMiB / 1024) + 'GB';
            }
          } catch (e) {
            try {
              const output = execSync('wmic path win32_VideoController get name /format:list', { encoding: 'utf-8', stdio: 'pipe' });
              const lines = output.trim().split(/\r?\n/);
              for (const line of lines) {
                if (line.includes('Name=')) {
                  gpu = line.split('=')[1].trim();
                  break;
                }
              }
            } catch (err) {}
          }
          
          const ramBytes = os.totalmem();
          const ramGB = Math.round(ramBytes / (1024 * 1024 * 1024)) + 'GB';
          cachedHwInfo = JSON.stringify({ gpuInfo: vram ? `${gpu} (${vram})` : gpu, ramInfo: ramGB });
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.end(cachedHwInfo);
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  return {
    plugins: [vue(), ...(command === 'serve' ? [hwInfoPlugin()] : [])],
  }
})
