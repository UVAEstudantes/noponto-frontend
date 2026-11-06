import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
      <View style={{ flex: 1 }}>
        <Text style={{ color: cores.textoPrimario, fontWeight: '600', fontSize: 12 }}>Radar de Espera · {c.estado}</Text>
        <Text numberOfLines={1} style={{ color: cores.textoSecundario, fontSize: 11 }}>{c.paradaNome} · {c.selecionadas.length} linhas</Text>
      </View>
      <Text style={{ color: cores.textoSecundario, fontSize: 12 }}>{expandida ? 'Recolher' : c.estado === 'encerrado' ? 'Configurar' : 'Editar'}</Text>
    </Pressable>
    {expandida && <View style={{ gap: 6, paddingBottom: 8 }}>
      <Text style={{ fontSize: 11, color: cores.textoSecundario }}>Funciona somente com o aplicativo aberto e a consulta ativa. Ao sair, as previsões são removidas.</Text>
      {c.disponiveis.length === 0 && <Text style={{ color: cores.textoSecundario }}>Selecione uma linha que atenda esta parada.</Text>}
      <Text style={{ fontSize: 11, color: cores.textoSecundario }}>Linhas · ★ reserva uma vaga para a prioridade, sem ocultar a chegada mais próxima.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 6 }} style={{ maxHeight: 56 }}>
      {c.disponiveis.map(l => <View key={l.linhaId} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1,
        borderColor: cores.bordaSuave, backgroundColor: c.selecionadas.includes(l.linhaId) ? cores.fundoSecundario : cores.fundoCard }}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Acompanhar linha ${l.linhaCodigo}`}
          accessibilityState={{ checked: c.selecionadas.includes(l.linhaId) }} disabled={!c.carregado}
          onPress={() => c.selecionarLinha(l.linhaId)} style={{ minWidth: 60, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: cores.textoPrimario }}>{c.selecionadas.includes(l.linhaId) ? '☑' : '☐'} {l.linhaCodigo}</Text>
        </Pressable>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Priorizar linha ${l.linhaCodigo}`}
          accessibilityState={{ checked: c.preferencias.prioritarias.includes(l.linhaId) }}
          disabled={!c.carregado || !c.selecionadas.includes(l.linhaId)} onPress={() => c.priorizarLinha(l.linhaId)}
          style={{ minHeight: 44, minWidth: 44, padding: 8, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: cores.textoPrimario, fontSize: 20 }}>{c.preferencias.prioritarias.includes(l.linhaId) ? '★' : '☆'}</Text>
        </Pressable>
      </View>)}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {botao('Diminuir antecedência', () => c.definirJanela(c.preferencias.janelaMinutos - 1), !c.carregado || c.preferencias.janelaMinutos <= 2, '−')}
        <Text style={{ color: cores.textoPrimario, fontSize: 12, flex: 1 }}>Antecedência · {c.preferencias.janelaMinutos} min</Text>
        {botao('Aumentar antecedência', () => c.definirJanela(c.preferencias.janelaMinutos + 1), !c.carregado || c.preferencias.janelaMinutos >= 15, '+')}
      </View>
      <Text style={{ color: cores.textoSecundario, fontSize: 10 }}>Edições atualizam o acompanhamento. Selecionar outra parada no Radar troca o alvo; mover o mapa não troca.</Text>
      {!!c.previa?.conteudo.terminal?.length && <View>
        <Text style={{ color: cores.textoPrimario, fontSize: 12 }}>{c.previa.conteudo.terminal.length} {c.previa.conteudo.terminal.length === 1 ? 'veículo aguardando' : 'veículos aguardando'} no terminal</Text>
        {c.previa.conteudo.terminal.slice(0, 3).map(v => <Text key={v.id} style={{ color: cores.textoSecundario, fontSize: 11 }}>
          {v.codigo}{v.desde != null ? ` · espera observada desde ${new Date(v.desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ' · sem horário de entrada confiável'}
        </Text>)}
      </View>}
      {c.mensagem && <Text style={{ color: cores.perigo, fontSize: 11 }}>{c.mensagem}</Text>}
      {c.erroPreferencias && <Text style={{ color: cores.perigo, fontSize: 11 }}>{c.erroPreferencias}</Text>}
      {typeof __DEV__ !== 'undefined' && __DEV__ && !!c.diagnosticos?.length && <View>
        <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Diagnóstico de seleção · DEV</Text>
        <ScrollView style={{ maxHeight: 100 }} nestedScrollEnabled>
          {c.diagnosticos.map(d => <Text key={d.eventoId} selectable style={{ color: cores.textoSecundario, fontSize: 10 }}>
            {d.linhaId} · {d.veiculoId ?? d.eventoId} · {d.motivo}
          </Text>)}
        </ScrollView>
      </View>}
    </View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 }}>
        {(c.estado === 'encerrado' || c.estado === 'pausado') && botao(c.estado === 'pausado' ? 'Retomar' : 'Ativar acompanhamento', () => { void c.ativar(); }, !c.podeAtivar || c.solicitando)}
        {c.estado !== 'encerrado' && botao('Encerrar', () => { void c.encerrar(); })}
      </View>
  </View>;
}
