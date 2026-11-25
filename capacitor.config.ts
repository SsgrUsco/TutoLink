import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.edu.usco.appnativa',
  appName: 'TutoLink',
  webDir: 'www',
  plugins: {
    CapacitorHttp: { enabled: false },
  },
};

export default config;
