import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useTema } from '@/src/hooks/useTema';
import type { PreviaNotificacaoRadar } from '@/src/services/previaNotificacaoRadar';
import type { ItemNotificacaoRadar } from '@/src/services/notificacoesRadar';

interface Props { previa: PreviaNotificacaoRadar }

/** Apresentação de desenvolvimento; não seleciona candidatos nem envia notificações. */
export default function PreviaNotificacaoRadarSection({ previa }: Props) {
  const { cores } = useTema();
  const [expandida, setExpandida] = useState(false);
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;

  const conteudo = previa?.conteudo;
  const destaque = conteudo?.destaque;
  const outrasPrioridades = conteudo?.prioridades.filter(item => item.id !== destaque?.id) ?? [];
  const alternativas = conteudo?.alternativas.filter(item => item.id !== destaque?.id) ?? [];
  const quantidade = previa?.candidatos.length ?? 0;
  const Chevron = expandida ? ChevronDown : ChevronRight;
  const candidato = (item: ItemNotificacaoRadar, emDestaque = false) => (
    <View key={item.id} style={{ padding: 8, borderRadius: 8, gap: 2,
      backgroundColor: emDestaque ? cores.fundoSecundario : cores.fundoCard }}>
      <Text style={{ color: cores.textoPrimario, fontSize: 12, fontWeight: emDestaque ? '700' : '500' }}>
        {`Linha ${item.codigo} · ${item.tipo === 'DEPARTURE' ? 'Saída prevista' : 'Chegada prevista'}: ${item.etaSeg < 60 ? 'menos de 1 min' : `${Math.ceil(item.etaSeg / 60)} min`}`}
      </Text>
      <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>
        {item.veiculoId ? `Veículo ${item.veiculoId}` : `Evento ${item.id}`}
      </Text>
    </View>
  );

  return (
    <View style={{ marginTop: 6, borderTopWidth: 1, borderColor: cores.bordaSuave, paddingTop: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Prévia de notificação em desenvolvimento"
        accessibilityState={{ expanded: expandida }} onPress={() => setExpandida(atual => !atual)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Chevron size={14} color={cores.iconeSecundario} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: cores.textoSecundario, fontSize: 11, fontWeight: '600' }}>
            Prévia de notificação · Dev
          </Text>
          {previa != null && <Text style={{ color: cores.textoSecundario, fontSize: 10 }}>
            {`${quantidade} ${quantidade === 1 ? 'candidato elegível' : 'candidatos elegíveis'}`}
          </Text>}
        </View>
      </Pressable>
      {expandida && <View style={{ gap: 5, paddingBottom: 6 }}>
        {previa == null ? (
          <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>
            Contexto indisponível ou consulta pausada.
          </Text>
        ) : quantidade === 0 ? (
          <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>
            Nenhuma previsão elegível neste contexto.
          </Text>
        ) : <>
          {destaque && <>
            <Text style={{ color: cores.textoPrimario, fontSize: 11, fontWeight: '600' }}>Destaque</Text>
            {candidato(destaque, true)}
          </>}
          {outrasPrioridades.length > 0 && <>
            <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Outras prioritárias</Text>
            {outrasPrioridades.map(item => candidato(item))}
          </>}
          {alternativas.length > 0 && <>
            <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Alternativas</Text>
            {alternativas.map(item => candidato(item))}
          </>}
        </>}
      </View>}
    </View>
  );
}
