import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

// Fallback: San Francisco (matches seed data)
export const DEFAULT_LOCATION = { latitude: 37.7749, longitude: -122.4194 };

export type UserLocation = {
  latitude: number;
  longitude: number;
  granted: boolean;
};

export function useUserLocation(): UserLocation | null {
  const [loc, setLoc] = useState<UserLocation | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) setLoc({ ...DEFAULT_LOCATION, granted: false });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mounted)
          setLoc({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            granted: true,
          });
      } catch {
        if (mounted) setLoc({ ...DEFAULT_LOCATION, granted: false });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return loc;
}
