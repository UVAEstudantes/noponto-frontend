import React from "react";
import { Text, View } from "react-native";
import { physicalAge, physicalFacilityName, physicalLocationLabel, type PhysicalVehicle } from "@/src/services/physicalPresenceContract";

// Same neutral presentation in the compact radar and the stop details, separate from arrivals.
export function renderPhysicalPresenceSection(vehicles: PhysicalVehicle[], now: number,
  cores: { textoPrimario: string; textoSecundario: string; bordaSuave: string }) {
  return vehicles.length > 0 ? <View style={{ borderTopWidth: 1, borderColor: cores.bordaSuave, marginTop: 9, paddingTop: 8 }}>
    <Text style={{ fontSize: 12, fontWeight: "700", color: cores.textoPrimario }}>
      Veículos no terminal · partida não confirmada
    </Text>
    <Text style={{ color: cores.textoSecundario, fontSize: 10 }}>Instalação observada; sentido e próxima viagem não confirmados.</Text>
    {vehicles.map((vehicle) => {
      const age = physicalAge(vehicle, now);
      return <View key={vehicle.key} style={{ paddingVertical: 5, opacity: age.opacity }}>
        <Text style={{ color: cores.textoPrimario, fontSize: 12 }}>
          {vehicle.serviceCode ? `Linha ${vehicle.serviceCode} · ` : ""}Veículo {vehicle.originalVehicleId}
        </Text>
        <Text style={{ color: cores.textoSecundario, fontSize: 10 }}>
          {vehicle.lineState === "Inherited" ? "Linha herdada" : vehicle.lineState === "Informed" ? "Linha informada" : "Linha não confirmada"}
          {` · GPS há ${Math.floor(age.seconds / 60)} min`}
          {age.delayed ? " · GPS atrasado" : ""}
          {` · ${physicalLocationLabel(vehicle)} · ${physicalFacilityName(vehicle.facilityStopId)}`}
        </Text>
      </View>;
    })}
  </View> : null;
}
