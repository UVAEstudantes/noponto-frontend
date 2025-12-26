import { LocateFixed } from "lucide-react-native";
import React, { useRef } from "react";
import { Pressable, Text } from "react-native";

export default function LocalButton({
  location,
  mapRef,
}: {
  location: any;
  mapRef: React.RefObject<any>;
}) {
  function locationUser() {
    if (mapRef.current) {
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

  return (
    <Pressable
      onPress={locationUser}
      className=" absolute right-10 bottom-[190px] bg-customBlack p-3 rounded-full"
    >
      <LocateFixed color="#FFC107" size={24} />
    </Pressable>
  );
}
