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

const INTERVALO_ATUALIZACAO_MS = 20_000;

function formatarSentidoDestinos(itinerario: ItinerarioLinha | null | undefined) {
  const destinoIda = itinerario?.destinoIda?.trim() ?? "";
  const destinoVolta = itinerario?.destinoVolta?.trim() ?? "";

  if (destinoIda && destinoVolta) {
    if (destinoIda.toLowerCase() === destinoVolta.toLowerCase()) {
      return destinoIda;
    }

    return `${destinoIda} ↔ ${destinoVolta}`;
  }

  if (destinoIda) {
    return destinoIda;
  }

  if (destinoVolta) {
    return destinoVolta;
  }

  return "Ida ↔ Volta";
}

export function useMobilidadeRio() {
  const [veiculos, setVeiculos] = useState<VeiculoTempoReal[]>([]);
  const [linhasDisponiveis, setLinhasDisponiveis] = useState<LinhaTempoReal[]>(
    [],
  );
  const [itinerariosPorLinha, setItinerariosPorLinha] = useState<
    Record<string, ItinerarioLinha | null>
  >({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const montadoRef = useRef(true);
  const requisicaoEmAndamentoRef = useRef(false);
  const itinerariosRef = useRef<Record<string, ItinerarioLinha | null>>({});
  const itinerariosEmAndamentoRef = useRef<
    Partial<Record<string, Promise<ItinerarioLinha | null>>>
  >({});

  useEffect(() => {
    itinerariosRef.current = itinerariosPorLinha;
  }, [itinerariosPorLinha]);

  useEffect(() => {
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const atualizarTempoReal = useCallback(async () => {
    if (requisicaoEmAndamentoRef.current) {
      return;
    }

    requisicaoEmAndamentoRef.current = true;

    try {
      const listaVeiculos = await buscarVeiculosTempoReal();

      if (!montadoRef.current) {
        return;
      }

      setVeiculos(listaVeiculos);
      setLinhasDisponiveis(construirLinhasDisponiveis(listaVeiculos));
      setErro(null);
    } catch (error) {
      if (!montadoRef.current) {
        return;
      }

      const mensagem =
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar os dados de transporte.";
      setErro(mensagem);
    } finally {
      if (montadoRef.current) {
        setCarregando(false);
      }
      requisicaoEmAndamentoRef.current = false;
    }
  }, []);

  useEffect(() => {
    void atualizarTempoReal();

    const intervalo = setInterval(() => {
      void atualizarTempoReal();
    }, INTERVALO_ATUALIZACAO_MS);

    return () => clearInterval(intervalo);
  }, [atualizarTempoReal]);

  const garantirItinerarioLinha = useCallback(
    async (linha: string, modal: ModalApiTransporte) => {
      const chave = chaveLinhaModal(linha, modal);
      const itinerarioEmCache = itinerariosRef.current[chave];

      if (itinerarioEmCache) {
        return itinerarioEmCache;
      }

      if (itinerariosEmAndamentoRef.current[chave]) {
        return itinerariosEmAndamentoRef.current[chave];
      }

      const promessa = buscarItinerarioLinha(linha, modal)
        .then((itinerario) => {
          if (!montadoRef.current) {
            return itinerario;
          }

          setItinerariosPorLinha((anterior) => {
            if (itinerario && anterior[chave]) {
              return anterior;
            }

            const proximo = {
              ...anterior,
              [chave]: itinerario,
            };

            itinerariosRef.current = proximo;
            return proximo;
          });

          return itinerario;
        })
        .finally(() => {
          delete itinerariosEmAndamentoRef.current[chave];
        });

      itinerariosEmAndamentoRef.current[chave] = promessa;
      return promessa;
    },
    [],
  );

  const getVeiculosLinha = useCallback(
    (linha: string, modal: ModalApiTransporte) => {
      const nomeLinha = linha.trim().toUpperCase();
      return veiculos.filter(
        (veiculo) => veiculo.modal === modal && veiculo.linha === nomeLinha,
      );
    },
    [veiculos],
  );

  const getSentidoLinha = useCallback(
    (linha: string, modal: ModalApiTransporte) => {
      const chave = chaveLinhaModal(linha, modal);
      return formatarSentidoDestinos(itinerariosPorLinha[chave]);
    },
    [itinerariosPorLinha],
  );

  const linhasOrdenadas = useMemo(() => linhasDisponiveis, [linhasDisponiveis]);

  return {
    carregando,
    erro,
    veiculos,
    linhasDisponiveis: linhasOrdenadas,
    itinerariosPorLinha,
    atualizarTempoReal,
    garantirItinerarioLinha,
    getVeiculosLinha,
    getSentidoLinha,
  };
}
