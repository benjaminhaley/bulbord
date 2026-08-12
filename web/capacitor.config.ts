import type { CapacitorConfig } from '@capacitor/cli'

// Native wrapper around the live site — see CLAUDE.md's Platform strategy
// ("Native app as the primary surface"). The appId is baked into the
// associated-domains files (public/.well-known/) and the native projects'
// signing config, so treat it as effectively permanent once a real
// device/store build exists.
const config: CapacitorConfig = {
  appId: 'com.bulbord.app',
  appName: 'Bulbord',
  webDir: 'dist',
  server: {
    // The shell loads nettelhorst.bulbord.com live rather than bundling
    // web/dist into the binary — a normal `railway up` deploy reaches every
    // installed app instantly, with no store resubmission, which is the
    // whole point per feedback #61 ("update as easily as the website").
    // `webDir`/`dist` above is still required by the Capacitor config type
    // and by `cap sync`, but its contents are never actually loaded while
    // `server.url` is set. Only shell-level changes (native plugins, icons,
    // this file) need a new store submission.
    url: 'https://nettelhorst.bulbord.com',
    cleartext: false,
  },
  plugins: {
    // Bridges navigator.credentials.create/get to native Credential Manager
    // (Android) / Keychain (iOS) APIs, since Android's WebView has no
    // built-in WebAuthn support — see CLAUDE.md's Platform strategy. The web
    // app's existing @simplewebauthn/browser calls (web/src/auth/webauthn.ts)
    // need no changes; this shim intercepts the same navigator.credentials
    // calls underneath them. `cap sync` auto-wires the native association
    // config (iOS entitlements, Android asset_statements) from `domains` —
    // which is why this is the one place to fix, not the generated files.
    //
    // `domains` must match WEBAUTHN_RP_ID (`bulbord.com`, the parent
    // platform domain — see CLAUDE.md's Login section), not `origin` below.
    // This was wired to nettelhorst.bulbord.com until 2026-08-12, caught
    // only by an actual on-device passkey attempt (a real Xcode/device
    // build didn't exist before then) — iOS rejected every native passkey
    // ceremony with "Application ... is not associated with domain
    // bulbord.com" because the entitlement it generated never matched the
    // RP ID the app was actually requesting.
    CapacitorPasskey: {
      origin: 'https://nettelhorst.bulbord.com',
      domains: ['bulbord.com'],
      autoShim: true,
    },
  },
}

export default config
