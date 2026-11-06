import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useTema } from '@/src/hooks/useTema';
import type { ControleRadarEspera } from '@/src/hooks/useRadarEspera';

export default function RadarEsperaSection({ controle: c }: { controle: ControleRadarEspera }) {
  const { cores } = useTema();
  const [expandida, setExpandida] = useState(false);
  const Chevron = expandida ? ChevronDown : ChevronRight;
  const botao = (rotulo: string, acao: () => void, desabilitado = false, texto = rotulo) => (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} disabled={desabilitado}
      accessibilityState={{ disabled: desabilitado }} onPress={acao}
      style={{ minHeight: 44, minWidth: 44, padding: 8, justifyContent: 'center', borderRadius: 8,
        backgroundColor: cores.fundoSecundario, opacity: desabilitado ? 0.5 : 1 }}>
      <Text style={{ fontSize: 12, color: cores.textoPrimario }}>{texto}</Text>
    </Pressable>
  );
  return <View style={{ marginTop: 6, borderTopWidth: 1, borderColor: cores.bordaSuave }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Radar de Espera"
      accessibilityState={{ expanded: expandida }} onPress={() => setExpandida(!expandida)}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Chevron size={15} color={cores.iconeSecundario} />
      <Text style={{ color: cores.textoPrimario, fontWeight: '600', fontSize: 12 }}>Radar de Espera · {c.estado}</Text>
    </Pressable>
    {expandida && <View style={{ gap: 6, paddingBottom: 8 }}>
      <Text style={{ fontSize: 11, color: cores.textoSecundario }}>Funciona somente com o aplicativo aberto e a consulta ativa. Ao sair, as previsões são removidas.</Text>
      {c.disponiveis.length === 0 && <Text style={{ color: cores.textoSecundario }}>Selecione uma linha que atenda esta parada.</Text>}
      {c.disponiveis.map(l => <View key={l.linhaId} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Acompanhar linha ${l.linhaCodigo}`}
          accessibilityState={{ checked: c.selecionadas.includes(l.linhaId) }} disabled={!c.carregado}
          onPress={() => c.selecionarLinha(l.linhaId)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: cores.textoPrimario }}>{c.selecionadas.includes(l.linhaId) ? '☑' : '☐'} Linha {l.linhaCodigo}</Text>
        </Pressable>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Priorizar linha ${l.linhaCodigo}`}
          accessibilityState={{ checked: c.preferencias.prioritarias.includes(l.linhaId) }}
          disabled={!c.carregado || !c.selecionadas.includes(l.linhaId)} onPress={() => c.priorizarLinha(l.linhaId)}
          style={{ minHeight: 44, padding: 8, justifyContent: 'center' }}>
          <Text style={{ color: cores.textoSecundario }}>{c.preferencias.prioritarias.includes(l.linhaId) ? '★ Prioritária' : '☆ Priorizar'}</Text>
        </Pressable>
      </View>)}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {botao('Diminuir antecedência', () => c.definirJanela(c.preferencias.janelaMinutos - 1), !c.carregado || c.preferencias.janelaMinutos <= 2, '−')}
        <Text style={{ color: cores.textoPrimario, fontSize: 12, flex: 1 }}>{c.preferencias.janelaMinutos} min</Text>
        {botao('Aumentar antecedência', () => c.definirJanela(c.preferencias.janelaMinutos + 1), !c.carregado || c.preferencias.janelaMinutos >= 15, '+')}
      </View>
      <Text style={{ color: cores.textoSecundario, fontSize: 10 }}>Alterar a seleção ou as preferências encerra o acompanhamento atual.</Text>
      {c.mensagem && <Text style={{ color: cores.perigo, fontSize: 11 }}>{c.mensagem}</Text>}
      {c.erroPreferencias && <Text style={{ color: cores.perigo, fontSize: 11 }}>{c.erroPreferencias}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {botao(c.estado === 'pausado' ? 'Retomar' : 'Ativar acompanhamento', () => { void c.ativar(); }, !c.podeAtivar || c.solicitando || c.estado === 'ativo' || c.estado === 'sem previsões')}
        {botao('Encerrar', () => { void c.encerrar(); })}
      </View>
    </View>}
  </View>;
}
