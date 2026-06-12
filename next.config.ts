import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 输出独立运行包，供 Docker 自托管部署使用（最小镜像，node server.js 启动）
  output: "standalone",
};

export default nextConfig;

// 集成 OpenNext Cloudflare 适配器：本地 dev 时可访问 Cloudflare 绑定
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
