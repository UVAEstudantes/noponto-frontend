// Set EXPO_PUBLIC_STARTUP_DIAGNOSTICS=1 when building an APK to collect logcat.
export function startupDiagnosticsEnabled() {
  return __DEV__ || process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS === "1";
}

export function startupLog(event: string, details?: unknown) {
  if (startupDiagnosticsEnabled()) {
    console.info(`[Startup] ${event}`, details ?? "");
  }
}
