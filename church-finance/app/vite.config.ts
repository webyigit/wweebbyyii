import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./": GitHub Pages 하위 경로 어디에 올려도 동작하도록 상대 경로
export default defineConfig({
  base: "./",
  plugins: [react()],
});
