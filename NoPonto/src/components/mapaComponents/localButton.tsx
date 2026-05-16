import { LocateFixed } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable } from "react-native";

export default function LocalButton({
  location,
  mapRef,
}: {
  location: any;
  mapRef: React.RefObject<any>;
}) {
  const { cores } = useTema();

  function locationUser() {
    if (mapRef.current) {
      // Para o mapa OSM, usa a função centerOnUser exposta via ref
      if (mapRef.current.centerOnUser) {
        mapRef.current.centerOnUser();
      }
      // Fallback para react-native-maps (se voltar a usar)
      else if (mapRef.current.animateToRegion) {
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
    }
  }

  return (
    <Pressable
      onPress={locationUser}
      className=" absolute right-10 bottom-[190px] bg-customBlack p-3 rounded-full"
      style={{ backgroundColor: cores.fundoNav }}
    >
      <LocateFixed color={cores.iconePrimario} size={24} />
    </Pressable>
  );
}
