import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gupn.kedu.focus',
  appName: '刻度｜专注计划助手',
  webDir: 'dist',
  androidScheme: 'https',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  loggingBehavior: 'none',
};

export default config;
