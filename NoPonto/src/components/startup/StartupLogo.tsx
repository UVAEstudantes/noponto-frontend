import React from "react";
import { Image } from "react-native";

export default function StartupLogo() {
  return (
    <Image
      source={require("../../../assets/images/iconeNovoSemFundo.png")}
      style={{ width: "60%", height: "40%", maxWidth: 250, maxHeight: 250 }}
      resizeMode="contain"
      accessibilityLabel="NoPonto"
    />
  );
}
