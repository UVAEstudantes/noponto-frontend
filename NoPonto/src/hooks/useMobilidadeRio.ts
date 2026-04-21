import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buscarItinerarioLinha,
  buscarVeiculosTempoReal,
  chaveLinhaModal,
  construirLinhasDisponiveis,
} from "@/src/services/mobilidadeRio";

import {
  ItinerarioLinha,
  LinhaTempoReal,
  ModalApiTransporte,
  VeiculoTempoReal,
} from "@/src/types/transporte";

import {
  iniciarGpsHub,
  conectarGpsHub,
} from "@/src/services/gpsHub";

const INTERVALO_ATUALIZACAO_MS = 60_000;

function formatarSentidoDestinos(
  itinerario: ItinerarioLinha | null | undefined,
) {
  const destinoIda = itinerario?.destinoIda?.trim() ?? "";
  const destinoVolta = itinerario?.destinoVolta?.trim() ?? "";

  if (destinoIda && destinoVolta) {
    if (destinoIda.toLowerCase() === destinoVolta.toLowerCase()) {
      return destinoIda;
    }

    return `${destinoIda} ↔ ${destinoVolta}`;
  }

  if (destinoIda) return destinoIda;
  if (destinoVolta) return destinoVolta;

  return "Ida ↔ Volta";
}

export function useMobilidadeRio() {

  const [veiculos, setVeiculos] =
    useState<VeiculoTempoReal[]>([]);

  const [linhasDisponiveis, setLinhasDisponiveis] =
    useState<LinhaTempoReal[]>([]);

  const [itinerariosPorLinha, setItinerariosPorLinha] =
    useState<Record<string, ItinerarioLinha | null>>({});

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const montadoRef = useRef(true);
  const itinerariosRef =
    useRef<Record<string, ItinerarioLinha | null>>({});

  const itinerariosEmAndamentoRef =
    useRef<
      Partial<
        Record<string, Promise<ItinerarioLinha | null>>
      >
    >({});

  useEffect(() => {
    itinerariosRef.current = itinerariosPorLinha;
  }, [itinerariosPorLinha]);

  useEffect(() => {
    return () => {
      montadoRef.current = false;
    };
  }, []);

  /* ---------------- SIGNALR ---------------- */

  useEffect(() => {

    iniciarGpsHub(
      (listaVeiculos) => {

        if (!montadoRef.current) return;

        if (!Array.isArray(listaVeiculos)) {
          return;
        }

        console.log(
          "🚍 realtime recebido:",
          listaVeiculos.length,
        );

        setVeiculos(listaVeiculos);

        setLinhasDisponiveis(
          construirLinhasDisponiveis(
            listaVeiculos,
          ),
        );

        setErro(null);
        setCarregando(false);
      },
    );

    conectarGpsHub();

    // ❗ NÃO parar conexão ao trocar tela

  }, []);

  /* -------- fallback HTTP -------- */

  useEffect(() => {

    async function fallback() {

      try {

        const lista =
          await buscarVeiculosTempoReal();

        if (!montadoRef.current) return;

        if (!Array.isArray(lista)) return;

        setVeiculos(lista);

        setLinhasDisponiveis(
          construirLinhasDisponiveis(lista),
        );

        setCarregando(false);

      } catch (err) {

        console.log("fallback erro", err);

      }

    }

    fallback();

    const intervalo = setInterval(
      fallback,
      INTERVALO_ATUALIZACAO_MS,
    );

    return () => clearInterval(intervalo);

  }, []);

  /* ---------- itinerário ---------- */

  const garantirItinerarioLinha =
    useCallback(
      async (
        linha: string,
        modal: ModalApiTransporte,
      ) => {

        const chave =
          chaveLinhaModal(linha, modal);

        const cache =
          itinerariosRef.current[chave];

        if (cache) return cache;

        if (
          itinerariosEmAndamentoRef
            .current[chave]
        ) {
          return itinerariosEmAndamentoRef
            .current[chave];
        }

        const promessa =
          buscarItinerarioLinha(
            linha,
            modal,
          )
            .then((itinerario) => {

              if (!montadoRef.current)
                return itinerario;

              setItinerariosPorLinha(
                (anterior) => ({

                  ...anterior,
                  [chave]: itinerario,

                }),
              );

              return itinerario;

            })
            .finally(() => {

              delete itinerariosEmAndamentoRef
                .current[chave];

            });

        itinerariosEmAndamentoRef
          .current[chave] = promessa;

        return promessa;

      },
      [],
    );

  /* ---------- SAFE ---------- */

  const getVeiculosLinha =
    useCallback(
      (
        linha: string,
        modal: ModalApiTransporte,
      ): VeiculoTempoReal[] => {

        if (!Array.isArray(veiculos))
          return [];

        const nomeLinha =
          linha.trim().toUpperCase();

        return veiculos.filter(
          (veiculo) =>
            veiculo.modal === modal &&
            veiculo.linha === nomeLinha,
        );

      },
      [veiculos],
    );

  const getSentidoLinha =
    useCallback(
      (
        linha: string,
        modal: ModalApiTransporte,
      ) => {

        const chave =
          chaveLinhaModal(linha, modal);

        return formatarSentidoDestinos(
          itinerariosPorLinha[chave],
        );

      },
      [itinerariosPorLinha],
    );

  const linhasOrdenadas =
    useMemo(
      () => linhasDisponiveis ?? [],
      [linhasDisponiveis],
    );

  return {

    carregando,
    erro,

    veiculos,

    linhasDisponiveis:
      linhasOrdenadas,

    itinerariosPorLinha,

    garantirItinerarioLinha,

    getVeiculosLinha,
    getSentidoLinha,

  };
}