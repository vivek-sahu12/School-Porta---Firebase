import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        schoolDashboard: resolve(__dirname, "dashboard.html"),
        adminLogin: resolve(__dirname, "admin/index.html"),
        adminDashboard: resolve(__dirname, "admin/dashboard.html"),
      },
    },
  },
});
