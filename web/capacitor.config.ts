import type { CapacitorConfig } from '@capacitor/cli'

// Native wrapper around the same built web app — see CLAUDE.md's Platform
// strategy. The appId is baked into the associated-domains files
// (public/.well-known/) and the native projects' signing config, so treat it
// as effectively permanent once a real device/store build exists.
const config: CapacitorConfig = {
  appId: 'com.bulbord.app',
  appName: 'Bulbord',
  webDir: 'dist',
  plugins: {
    // Bridges navigator.credentials.create/get to native Credential Manager
    // (Android) / Keychain (iOS) APIs, since Android's WebView has no
    // built-in WebAuthn support — see CLAUDE.md's Platform strategy. The web
    // app's existing @simplewebauthn/browser calls (web/src/auth/webauthn.ts)
    // need no changes; this shim intercepts the same navigator.credentials
    // calls underneath them. `cap sync` auto-wires the native association
    // config (iOS entitlements, Android asset_statements) from `domains`.
    CapacitorPasskey: {
      origin: 'https://nettlehorst.bulbord.com',
      domains: ['nettlehorst.bulbord.com'],
      autoShim: true,
    },
  },
}

export default config
