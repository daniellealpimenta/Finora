import type { NextConfig } from "next";

// NEXT_OUTPUT=export gera HTML estático para o programa (.exe/.app, servido pelo FastAPI);
// sem ela, fica como sempre (modo web). Vai para out-desktop/ (com distDir próprio o export
// termina nele), sem pisar no .next do `npm run dev` que estiver aberto.
const desktop = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = desktop
  ? { output: "export", trailingSlash: true, distDir: "out-desktop" }
  : { output: "standalone" };

export default nextConfig;
