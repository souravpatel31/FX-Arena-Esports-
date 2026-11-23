import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fxarena.esports',
  appName: 'FX Arena eSport',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'secret-scanner-g7cvm.web.app'
  }
};

export default config;
