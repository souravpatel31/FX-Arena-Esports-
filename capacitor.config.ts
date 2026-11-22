import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fxarena.esports',
  appName: 'FX Arena Esports',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
