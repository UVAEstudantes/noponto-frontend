import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { MessageCircle, Sparkles, Star, Users } from "lucide-react-native";
import {
  BotaoDemo,
  CampoDemo,
  PainelDemo,
  useVisualDemo,
} from "@/src/components/demo/InterfaceDemo";
import { useFavoritos } from "@/src/hooks/useFavoritos";
import {
  carregarPerfil,
  coresAvatar,
  PerfilLocal,
  perfilVazio,
  salvarPerfil,
} from "./perfilLocal";
import {
  AvatarIniciais,
  ConquistasPerfil,
  EstatisticasPerfil,
  FavoritaPerfil,
  ResumoMobilidade,
} from "./ConteudoPerfil";

export default function PerfilTela() {
  const { cores, texto, secundario, card } = useVisualDemo();
  const [perfil, setPerfil] = useState<PerfilLocal>(perfilVazio);
  const [draft, setDraft] = useState<PerfilLocal | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState("");
  const [leitura, setLeitura] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [info, setInfo] = useState<"retrospectiva" | "comunidade" | null>(null);
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const favoritos = useFavoritos();
  useEffect(() => {
    let ativo = true;
    setErro("");
    void carregarPerfil(AsyncStorage)
      .then((value) => {
        if (ativo) {
          setPerfil(value);
          setPronto(true);
        }
      })
      .catch(() => {
        if (ativo)
          setErro(
            "Não foi possível ler seu perfil. Os dados locais foram preservados.",
          );
      });
    return () => {
      ativo = false;
    };
  }, [leitura]);
  const salvar = async () => {
    if (!draft || lock.current) return;
    lock.current = true;
    setSalvando(true);
    setErro("");
    try {
      setPerfil(await salvarPerfil(AsyncStorage, draft));
      setDraft(null);
      setFeedback("Perfil salvo somente neste aparelho.");
    } catch {
      setErro(
        "Não foi possível salvar. Tente novamente; sua edição foi mantida.",
      );
    } finally {
      lock.current = false;
      setSalvando(false);
    }
  };
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: cores.fundoApp }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 130, gap: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <AvatarIniciais perfil={perfil} />
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={[texto, { fontSize: 26, fontWeight: "800" }]}
            >
              {perfil.nome || "Seu perfil"}
            </Text>
            <Text style={secundario}>Sua jornada pelo transporte público.</Text>
          </View>
        </View>
        <BotaoDemo
          secundario
          disabled={!pronto}
          onPress={() => {
            setErro("");
            setFeedback("");
            setDraft({ ...perfil });
          }}
        >
          Editar perfil
        </BotaoDemo>
        {!pronto && !erro && (
          <ActivityIndicator
            accessibilityLabel="Carregando perfil local"
            color="#B48200"
          />
        )}
        {!!erro && !draft && (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={{ color: cores.perigo }}>
              {erro}
            </Text>
            <BotaoDemo secundario onPress={() => setLeitura((v) => v + 1)}>
              Tentar novamente
            </BotaoDemo>
          </View>
        )}
        {!!feedback && (
          <Text accessibilityLiveRegion="polite" style={texto}>
            {feedback}
          </Text>
        )}
        <Text style={secundario}>
          Sem conta ou login. Apenas nome e cor do avatar são salvos localmente.
        </Text>
        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Star color="#B48200" size={22} />
            <Text style={[texto, { fontSize: 20, fontWeight: "800" }]}>
              Suas linhas favoritas
            </Text>
          </View>
          <Text style={secundario}>
            Seus favoritos reais, salvos neste aparelho
          </Text>
          {favoritos.status === "carregando" ? (
            <ActivityIndicator color="#B48200" />
          ) : favoritos.status === "erro" ? (
            <>
              <Text style={secundario}>{favoritos.erro}</Text>
              <BotaoDemo
                secundario
                onPress={() => {
                  void favoritos.tentarNovamente();
                }}
              >
                Tentar carregar favoritos
              </BotaoDemo>
            </>
          ) : favoritos.linhas.length === 0 ? (
            <Text style={secundario}>
              Você ainda não favoritou nenhuma linha. Toque na estrela de uma
              linha para encontrá-la aqui.
            </Text>
          ) : (
            favoritos.linhas
              .slice(0, 4)
              .map((l) => (
                <FavoritaPerfil
                  key={l.linhaId}
                  codigo={l.codigo}
                  nome={l.nome}
                  modal={l.modal}
                />
              ))
          )}
          <BotaoDemo secundario onPress={() => router.navigate("/linhas")}>
            Abrir Linhas
            {favoritos.linhas.length > 4
              ? ` · ver todas (${favoritos.linhas.length})`
              : ""}
          </BotaoDemo>
        </View>
        <ResumoMobilidade />
        <EstatisticasPerfil />
        <ConquistasPerfil />
        <View style={[card, { borderColor: "#B48200" }]}>
          <Sparkles color="#B48200" size={26} />
          <Text style={[texto, { fontSize: 21, fontWeight: "800" }]}>
            Sua retrospectiva
          </Text>
          <Text style={secundario}>
            Descubra como foi sua jornada pelo Rio. Uma futura coleção de
            histórias sobre os seus caminhos.
          </Text>
          <Text style={secundario}>
            Prévia ilustrativa · sem histórico real
          </Text>
          <BotaoDemo onPress={() => setInfo("retrospectiva")}>
            Conhecer a prévia
          </BotaoDemo>
        </View>
        <View style={card}>
          <Users color={cores.textoPrimario} size={24} />
          <Text style={[texto, { fontSize: 20, fontWeight: "800" }]}>
            Comunidade · em breve
          </Text>
          <Text style={secundario}>
            Contribuições sobre linhas e paradas, com contexto e confiabilidade.
          </Text>
          <BotaoDemo secundario onPress={() => setInfo("comunidade")}>
            Conhecer possibilidades
          </BotaoDemo>
        </View>
      </ScrollView>
      {draft && (
        <PainelDemo
          titulo="Editar perfil"
          onFechar={() => {
            if (!lock.current) setDraft(null);
          }}
          rodape={
            <View style={{ gap: 8 }}>
              <BotaoDemo
                disabled={salvando}
                onPress={() => {
                  void salvar();
                }}
              >
                {salvando ? "Salvando…" : "Salvar perfil"}
              </BotaoDemo>
              <BotaoDemo
                secundario
                disabled={salvando}
                onPress={() => setDraft(null)}
              >
                Cancelar
              </BotaoDemo>
            </View>
          }
        >
          <View style={{ alignItems: "center" }}>
            <AvatarIniciais perfil={draft} tamanho={76} />
          </View>
          <CampoDemo
            label="Nome (opcional)"
            value={draft.nome}
            maxLength={60}
            onChangeText={(nome) => setDraft({ ...draft, nome })}
          />
          <Text style={secundario}>
            Pode ser só seu primeiro nome. Nenhum dado será enviado ao servidor.
          </Text>
          <Text style={[texto, { fontWeight: "700" }]}>Cor do avatar</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {coresAvatar.map((cor, i) => (
              <Pressable
                key={cor}
                accessibilityRole="radio"
                accessibilityLabel={`Cor do avatar ${i + 1}`}
                accessibilityState={{ selected: draft.cor === cor }}
                onPress={() => setDraft({ ...draft, cor })}
                android_ripple={{ color: "#FFFFFF50", borderless: true }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: cor,
                  borderWidth: draft.cor === cor ? 3 : 0,
                  borderColor: cores.textoPrimario,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 20 }}>
                  {draft.cor === cor ? "✓" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
          {!!erro && (
            <Text accessibilityRole="alert" style={{ color: cores.perigo }}>
              {erro}
            </Text>
          )}
        </PainelDemo>
      )}
      {info && (
        <PainelDemo
          titulo={
            info === "retrospectiva"
              ? "Sua retrospectiva"
              : "Comunidade no NoPonto"
          }
          onFechar={() => setInfo(null)}
          rodape={
            <BotaoDemo secundario onPress={() => setInfo(null)}>
              Voltar ao Perfil
            </BotaoDemo>
          }
        >
          {info === "retrospectiva" ? (
            <>
              <Sparkles color="#B48200" size={32} />
              <Text style={[texto, { fontSize: 23, fontWeight: "800" }]}>
                Cada caminho conta uma história.
              </Text>
              <Text style={secundario}>
                Demonstração: 24 viagens, 18 horas e a linha 838 em destaque.
                Estes números pertencem apenas ao exemplo.
              </Text>
              <Text style={secundario}>
                No futuro: seu modal preferido, maior deslocamento, regiões
                percorridas e um resumo compartilhável.
              </Text>
              <Text style={texto}>
                Compartilhamento e histórico pessoal ainda não estão
                disponíveis.
              </Text>
            </>
          ) : (
            <>
              <MessageCircle size={30} color={cores.textoPrimario} />
              <Text style={[texto, { fontSize: 21, fontWeight: "800" }]}>
                Uma cidade mais conectada.
              </Text>
              <Text style={secundario}>
                Comentários sobre linhas, relatos em paradas, informações de
                estações e insígnias de contribuição poderão ajudar a
                comunidade.
              </Text>
              <Text style={secundario}>
                Relatos precisarão de contexto e verificação. Informações de
                segurança e risco não serão fatos confirmados apenas por terem
                sido publicadas.
              </Text>
              <Text style={texto}>
                Sem publicação, comentários ou ocorrências reais nesta prévia.
              </Text>
            </>
          )}
        </PainelDemo>
      )}
    </SafeAreaView>
  );
}
