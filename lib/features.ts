/**
 * Product-focus flags.
 *
 * ARGUS is being narrowed to its core loop — a political-risk / election
 * monitoring workbench. Capabilities that don't serve that loop are HIDDEN
 * (not deleted) behind these flags so the product reads as a sharp knife, not a
 * Swiss-army keychain. Flip any flag back to `true` to restore the feature
 * instantly — all the code is still here.
 */
export const FEATURES = {
  liveTracking: true, // vessels (AIS) + aviation (ADS-B) — capability AVAILABLE, but the layers are gated PER PROJECT by goal (see liveTrackingForGoal in goalTemplates). Only maritime-security / armed-conflict / counterterrorism turn them on, so other projects pay no latency. This flag only controls whether the keys + settings for the capability exist.
  droneCam:     false, // recon "drone camera" fly-over view — demo flash, not analysis
  tacticalHud:  false, // military-style HUD overlay — cosplay, not analysis
  entityGraph:  false, // node/edge investigation graph — half-built, not the core loop
  hazardFeeds:  false, // GDACS / USGS / WHO / FIRMS — disaster/health/fire feeds. Noise for a political tool; cut from the default feed.
  /** Inject tagged demo events when every live feed fails. Off by default — set NEXT_PUBLIC_DEMO_FALLBACK=true to enable. */
  demoFallback: process.env.NEXT_PUBLIC_DEMO_FALLBACK === 'true',
  /** Pre-seed demo analyst projects on the home screen. Off by default — set NEXT_PUBLIC_DEMO_PROJECTS=true to enable. */
  demoProjects: process.env.NEXT_PUBLIC_DEMO_PROJECTS === 'true',
} as const
