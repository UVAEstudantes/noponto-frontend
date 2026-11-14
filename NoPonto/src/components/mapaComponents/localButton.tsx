import { LocateFixed } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React, { useRef } from "react";
import { Pressable } from "react-native";

export default function LocalButton({
  location,
  mapRef,
  onRequestLocation,
}: {
  onRequestLocation?: () => Promise<void>;
  location: any;
  mapRef: React.RefObject<any>;
}) {
  const { cores } = useTema();
  const pendingLocation = useRef<Promise<void> | null>(null);
  function locationUser() {
    if (location?.coords && mapRef.current?.centerOnUser) {
      mapRef.current.centerOnUser();
      return;
    }
    if (onRequestLocation) {
      if (!pendingLocation.current) {
        const pending = Promise.resolve().then(onRequestLocation);
        pendingLocation.current = pending;
        void pending.finally(() => { if (pendingLocation.current === pending) pendingLocation.current = null; }).catch(() => {});
      }
      return;
    }
    if (mapRef.current?.centerOnUser) {
      mapRef.current.centerOnUser();
      return;
    }
    if (location?.coords && mapRef.current?.animateToRegion)
      mapRef.current.animateToRegion(
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000,
      );
  }
  return (
    <Pressable
      onPress={locationUser}
      accessibilityRole="button"
      accessibilityLabel="Centralizar mapa na sua localização"
      hitSlop={8}
      style={{
        borderRadius: 999,
        width: 48,
        height: 48,
        backgroundColor: cores.fundoPrimario,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
      }}
    >
      <LocateFixed color={cores.textoInverso} size={24} />
    </Pressable>
  );
}
