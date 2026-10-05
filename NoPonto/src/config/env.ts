/**
 * Centralized configuration for the NoPonto application
 * All configurable values are loaded from environment variables
 */

export const config = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8080",
  GPS_HUB_ROUTE: process.env.EXPO_PUBLIC_GPS_HUB_ROUTE || "/hub/gps",
  GPS_HUB_URL:
    process.env.EXPO_PUBLIC_GPS_HUB_URL || "ws://localhost:8080/hub/gps",
  REQUEST_TIMEOUT_MS:
    Number(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS) || 10000,
  RAIL_POLL_INTERVAL_MS:
    Number(process.env.EXPO_PUBLIC_RAIL_POLL_INTERVAL_MS) || 5000,
  RAIL_DEMO: process.env.EXPO_PUBLIC_RAIL_DEMO === "true",
} as const;

export type Config = typeof config;
