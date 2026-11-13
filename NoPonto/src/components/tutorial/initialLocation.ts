import type * as Location from "expo-location";

export const INITIAL_LOCATION_KEY = "@onboarding:foreground-location:v1";
export async function resolveInitialLocation(
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> },
  location: Pick<typeof Location, "getForegroundPermissionsAsync" | "requestForegroundPermissionsAsync" | "getCurrentPositionAsync">,
  timeoutMs = 8000,
): Promise<Location.LocationObject | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let permission = await location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.status === "undetermined" && permission.canAskAgain) {
      if (await storage.getItem(INITIAL_LOCATION_KEY)) return null;
      // Record the attempt before opening Android's dialog, including interrupted launches.
      await storage.setItem(INITIAL_LOCATION_KEY, "1");
      permission = await location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;
    return await Promise.race([
      location.getCurrentPositionAsync(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
