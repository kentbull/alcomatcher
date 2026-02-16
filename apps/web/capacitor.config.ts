import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.alcomatcher.app",
  appName: "AlcoMatcher",
  webDir: "dist",
  server: {
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#f7d79f"
    }
  }
};

export default config;
