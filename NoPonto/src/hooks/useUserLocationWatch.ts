import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import * as Location from 'expo-location';

export function watchUserLocation(onLocation: (location: Location.LocationObject) => void) {
  let generation = 0;
  let subscription: Location.LocationSubscription | undefined;
  const stop = () => { generation++; subscription?.remove(); subscription = undefined; };
  const start = async () => {
    stop();
    const current = generation;
    try {
      if (!(await Location.getForegroundPermissionsAsync()).granted || current !== generation) return;
      const next = await Location.watchPositionAsync({accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 5},
        value => { if (current === generation) onLocation(value); });
      if (current !== generation) next.remove();
      else subscription = next;
    } catch { /* Permission or provider unavailable; retry on next foreground entry. */ }
  };
  const listener = AppState.addEventListener('change', state => { if (state === 'active') void start(); else stop(); });
  if (AppState.currentState === 'active') void start();
  return () => { stop(); listener.remove(); };
}

export function useUserLocationWatch(enabled: boolean, onLocation: (location: Location.LocationObject) => void) {
  const latest = useRef(onLocation);
  latest.current = onLocation;
  useEffect(() => enabled ? watchUserLocation(value => latest.current(value)) : undefined, [enabled]);
}
