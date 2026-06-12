import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// 本应用无状态、无 ISR/增量再生，不需要持久化缓存，故使用默认配置。
export default defineCloudflareConfig({})
