export type Rotina = { id: number; nome: string; origem: string; destino: string; hora: string; dias: number[]; voz: boolean; ativa: boolean; avisos?: boolean; alternativas?: boolean };
export function formatarHoraRotina(hora: number, minuto: number) {
  if (!Number.isInteger(hora) || !Number.isInteger(minuto) || hora < 0 || hora > 23 || minuto < 0 || minuto > 59) throw Error("Horário inválido");
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}
export function etapasRotina(rotina: Rotina, alternativa = false) {
  return [
    { tipo: "Caminhada", de: rotina.origem, ate: "Ponto de embarque ilustrativo", instrucao: "Caminhe até o embarque indicado na futura rota." },
    { tipo: alternativa ? "Metrô · exemplo B" : "Ônibus · exemplo A", de: "Embarque ilustrativo", ate: "Integração ilustrativa", instrucao: "A linha e as paradas serão definidas pelo futuro motor de rotas." },
    { tipo: "Caminhada", de: "Desembarque ilustrativo", ate: "Estação ilustrativa", instrucao: "Siga as instruções de integração." },
    { tipo: "Trem · exemplo C", de: "Estação ilustrativa", ate: "Desembarque ilustrativo", instrucao: "Acompanhe o trecho e prepare-se para descer." },
    { tipo: "Caminhada", de: "Desembarque ilustrativo", ate: rotina.destino, instrucao: "Siga até o destino final." },
  ];
}
export const estadosViagem = ["Ainda não iniciada", "Aguardando embarque", "Em deslocamento", "Próxima descida", "Integração", "Concluída"];

export const exemplosRotinas: Rotina[] = [
  { id: 1, nome: "Faculdade", origem: "Casa", destino: "Faculdade", hora: "06:30", dias: [0,1,2,3,4], voz: true, ativa: true },
  { id: 2, nome: "Volta para casa", origem: "Faculdade", destino: "Casa", hora: "18:00", dias: [0,1,2,3,4], voz: true, ativa: false },
];
export function validarRotina(r: Rotina) {
  if (![r.nome, r.origem, r.destino].every(v => v.trim())) return "Preencha nome, origem e destino.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora)) return "Escolha um horário válido.";
  if (!r.dias.length || r.dias.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return "Selecione ao menos um dia.";
  return "";
}
export function salvarRotinaLocal(lista: Rotina[], r: Rotina) {
  const erro = validarRotina(r);
  if (erro) throw Error(erro);
  const limpa = { ...r, nome: r.nome.trim(), origem: r.origem.trim(), destino: r.destino.trim(), dias: [...new Set(r.dias)].sort() };
  return lista.some(item => item.id === r.id) ? lista.map(item => item.id === r.id ? limpa : item) : [...lista, limpa];
}
