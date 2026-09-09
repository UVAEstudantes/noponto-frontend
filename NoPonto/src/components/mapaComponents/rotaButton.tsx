import { MapPinPlus } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable } from "react-native";
export default function RotaButton() { const { cores } = useTema(); function novaRota() { console.log("btn clicado"); } return <Pressable onPress={novaRota} accessibilityRole="button" accessibilityLabel="Criar rota" hitSlop={8} style={{ borderRadius: 999, width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: cores.fundoPainel, borderWidth: 1, borderColor: cores.borda, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}><MapPinPlus color={cores.iconePrimario} size={24} /></Pressable>; }
