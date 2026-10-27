import type { NextConfig } from "next";

// NEXT_OUTPUT=export gera HTML estático para o .exe (servido pelo FastAPI);
// sem ela, fica como sempre (modo web).
const desktop = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = desktop
  ? { output: "export", trailingSlash: true }
  : { output: "standalone" };

export default nextConfig;
