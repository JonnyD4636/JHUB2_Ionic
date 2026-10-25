import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jonnyd.receiptly.capacitor',
  appName: 'Receiptly PWA',
  webDir: 'www',
  plugins: {
    SystemBars: { style: 'DARK', initialViewportFitValueHint: 'cover' },
    StatusBar: { style: 'DARK', overlaysWebView: true }
  }
};

export default config;
