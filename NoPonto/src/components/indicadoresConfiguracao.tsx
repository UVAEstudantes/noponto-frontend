import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Check, ChevronDown, ChevronUp, MapPin } from "lucide-react-native";
import { SvgXml } from "react-native-svg";
import { useTema } from "../hooks/useTema";
import { useIndicadores } from "../context/ProvedorIndicadores";
import {
  estilosIndicadores,
  familiasIndicadores,
  modaisIndicadores,
  type ModalIndicador,
} from "../constants/indicadores";
import { renderizarIndicador } from "../services/apresentacaoIndicadores";

export default function IndicadoresConfiguracao() {
  const { cores } = useTema();
  const { preferencias, carregando, erro, atualizar } = useIndicadores();
  const [aberto, setAberto] = useState(false);
  const [modal, setModal] = useState<ModalIndicador>("onibus");
  const selecionado = preferencias.global
    ? preferencias.estiloGlobal
    : preferencias.individuais[modal];
  const modaisPrevia = preferencias.global
    ? modaisIndicadores
    : modaisIndicadores.filter((m) => m.id === modal);
  return (
    <View
      className="mt-4 rounded-2xl p-4"
      style={{
        backgroundColor: cores.fundoCard,
        borderColor: cores.borda,
        borderWidth: 1,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        onPress={() => setAberto(!aberto)}
        className="flex-row items-center"
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: cores.fundoSecundario }}
        >
          <MapPin size={20} color={cores.iconeSecundario} />
        </View>
        <View className="ml-3 flex-1 pr-2">
          <Text
            className="text-base font-semibold"
            style={{ color: cores.textoPrimario }}
          >
            Indicadores dos veículos
          </Text>
          <Text className="text-sm" style={{ color: cores.textoSecundario }}>
            Personalize a aparência dos veículos no mapa.
          </Text>
        </View>
        {aberto ? (
          <ChevronUp size={20} color={cores.iconeSecundario} />
        ) : (
          <ChevronDown size={20} color={cores.iconeSecundario} />
        )}
      </Pressable>
      {aberto && (
        <View className="mt-1">
          <View className="flex-row items-center mb-3">
            <Text
              className="flex-1 text-sm font-semibold pr-3"
              style={{ color: cores.textoPrimario }}
            >
              Usar mesmo estilo para todos
            </Text>
            <Switch
              value={preferencias.global}
              disabled={carregando}
              onValueChange={(global) => atualizar({ global })}
              accessibilityLabel="Usar mesmo estilo para todos os veículos"
              trackColor={{
                false: cores.bordaSuave,
                true: cores.fundoPrimarioSuave,
              }}
              thumbColor={
                preferencias.global ? cores.fundoPrimario : cores.borda
              }
            />
          </View>
          <Text
            className="text-sm mb-4"
            style={{ color: cores.textoSecundario }}
          >
            {preferencias.global
              ? "O estilo selecionado vale para Ônibus, BRT e Trem."
              : "Escolha um modal para personalizar seu indicador."}
          </Text>
          {!preferencias.global && (
            <View className="mb-3 flex-row">
              {modaisIndicadores.map((item, index) => (
                <Pressable
                  key={item.id}
                  disabled={carregando}
                  accessibilityRole="radio"
                  accessibilityLabel={`${item.nome}: ${familiasIndicadores[preferencias.individuais[item.id]].nome}`}
                  accessibilityState={{ selected: modal === item.id }}
                  onPress={() => setModal(item.id)}
                  className="flex-1 rounded-xl p-3 items-center mb-2"
                  style={{
                    marginRight: index < 2 ? 8 : 0,
                    backgroundColor:
                      modal === item.id
                        ? cores.fundoSecundario
                        : cores.fundoPainel,
                    borderWidth: 1,
                    borderColor:
                      modal === item.id ? cores.fundoPrimario : cores.borda,
                  }}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: cores.textoPrimario }}
                  >
                    {item.nome}
                  </Text>
                  <Text
                    className="text-xs mt-1"
                    style={{ color: cores.textoSecundario }}
                  >
                    {
                      familiasIndicadores[preferencias.individuais[item.id]]
                        .nome
                    }
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {estilosIndicadores.map((estilo) => {
            const ativo = selecionado === estilo.id;
            return (
              <Pressable
                key={estilo.id}
                disabled={carregando}
                accessibilityRole="radio"
                accessibilityLabel={`${preferencias.global ? "Todos os veículos" : modaisIndicadores.find((m) => m.id === modal)?.nome}: ${estilo.nome}`}
                accessibilityState={{ selected: ativo, disabled: carregando }}
                onPress={() =>
                  atualizar(
                    preferencias.global
                      ? { estiloGlobal: estilo.id }
                      : {
                          individuais: {
                            ...preferencias.individuais,
                            [modal]: estilo.id,
                          },
                        },
                  )
                }
                className="rounded-xl p-3 mb-2 flex-row items-center"
                style={{
                  backgroundColor: ativo
                    ? cores.fundoSecundario
                    : cores.fundoPainel,
                  borderColor: ativo ? cores.fundoPrimario : cores.bordaSuave,
                  borderWidth: 1,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <View style={{ flexGrow: 1, flexBasis: 80 }}>
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: cores.textoPrimario }}
                  >
                    {estilo.nome}
                  </Text>
                  {ativo && (
                    <Check
                      size={16}
                      color={cores.iconeSecundario}
                      style={{ marginTop: 6 }}
                    />
                  )}
                </View>
                <View
                  className="flex-row"
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {modaisPrevia.map((item) => {
                    const previa = renderizarIndicador(
                      estilo.id,
                      item.id,
                      "#FFC400",
                    );
                    return (
                      <View
                        key={item.id}
                        style={{ width: 48, alignItems: "center" }}
                      >
                        <View
                          style={{
                            height: 68,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <SvgXml
                            xml={previa.svg}
                            width={previa.largura * 1.5}
                            height={previa.altura * 1.5}
                          />
                        </View>
                        <Text
                          className="text-xs"
                          style={{ color: cores.textoSecundario }}
                        >
                          {item.nome}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            );
          })}
          <Text
            className="mt-1 text-xs"
            accessibilityLiveRegion="polite"
            style={{ color: cores.textoSecundario }}
          >
            {carregando
              ? "Carregando preferências…"
              : (erro ?? "As preferências são salvas automaticamente.")}
          </Text>
        </View>
      )}
    </View>
  );
}
