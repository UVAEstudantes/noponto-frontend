const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.join(__dirname, "favoritos.ts");
const modulo = new Module(filename, module);
modulo._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { criarColecaoFavoritos, lerFavoritos, CHAVE_FAVORITOS } = modulo.exports;

const linha = (numero, modal = "onibus") => ({
  linhaId: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`,
  codigo: "866", nome: `Linha ${numero}`, modal, modalId: `modal-${modal}`,
});
function armazenamento(raw = null) {
  const valores = new Map([[CHAVE_FAVORITOS, raw], ["@linhasSelecionadas", "configuração existente"]]);
  const writes = [];
  return { valores, writes, getItem: async (key) => valores.get(key) ?? null,
    setItem: async (key, value) => { writes.push([key, value]); valores.set(key, value); } };
}

test("favoritar/desfavoritar/refavoritar não duplica nem altera linhas selecionadas", async () => {
  const storage = armazenamento();
  const store = criarColecaoFavoritos(storage);
  await store.hidratar();
  assert.equal(storage.writes.length, 0);
  store.alternar(linha(1));
  assert.equal(store.getSnapshot().linhas.length, 1); // atualização imediata
  await store.tentarNovamente();
  store.alternar(linha(1));
  assert.equal(store.getSnapshot().linhas.length, 0);
  store.alternar(linha(1));
  await store.tentarNovamente();
  assert.equal(lerFavoritos(storage.valores.get(CHAVE_FAVORITOS)).length, 1);
  assert.equal(storage.valores.get("@linhasSelecionadas"), "configuração existente");
  assert.ok(storage.writes.every(([key]) => key === CHAVE_FAVORITOS));
});

test("todos os modais e códigos iguais com UUIDs diferentes persistem sem limite de dez", async () => {
  const storage = armazenamento();
  const store = criarColecaoFavoritos(storage);
  await store.hidratar();
  for (let i = 1; i <= 12; i++) store.alternar(linha(i, ["onibus", "brt", "trem", "metro"][i % 4]));
  await store.tentarNovamente();
  const reabertura = criarColecaoFavoritos(storage);
  await reabertura.hidratar();
  assert.equal(reabertura.getSnapshot().linhas.length, 12);
  assert.equal(new Set(reabertura.getSnapshot().linhas.map((item) => item.modal)).size, 4);
  assert.ok(reabertura.getSnapshot().linhas.every((item) => item.codigo === "866"));
});

test("hidratação em andamento é compartilhada e não grava estado inicial vazio", async () => {
  let liberar, leituras = 0;
  const storage = armazenamento();
  storage.getItem = () => { leituras++; return new Promise((resolve) => { liberar = resolve; }); };
  const store = criarColecaoFavoritos(storage);
  const a = store.hidratar();
  assert.equal(store.hidratar(), a);
  store.alternar(linha(1)); // ações ficam bloqueadas antes da leitura
  assert.equal(storage.writes.length, 0);
  liberar(JSON.stringify([{ ...linha(2), adicionadaEm: "2026-10-10T12:00:00Z" }]));
  await a;
  assert.equal(leituras, 1);
  assert.equal(store.getSnapshot().linhas[0].linhaId, linha(2).linhaId);
  assert.equal(storage.writes.length, 0);
});

test("JSON inválido e falha de leitura preservam os dados; retry pode recuperar", async () => {
  for (const invalido of ["{quebrado", "{}", '[{"linhaId":"incompleta"}]']) {
    const storage = armazenamento(invalido);
    const store = criarColecaoFavoritos(storage);
    await store.hidratar();
    assert.equal(store.getSnapshot().status, "erro");
    store.alternar(linha(1));
    await store.tentarNovamente();
    assert.equal(storage.valores.get(CHAVE_FAVORITOS), invalido);
    assert.equal(storage.writes.length, 0);
  }
  const storage = armazenamento();
  storage.getItem = async () => { throw new Error("storage indisponível"); };
  const store = criarColecaoFavoritos(storage);
  await store.hidratar();
  assert.equal(store.getSnapshot().status, "erro");
  storage.getItem = async () => null;
  await store.tentarNovamente();
  assert.equal(store.getSnapshot().status, "pronto");
  assert.equal(storage.writes.length, 0);
});

test("falha ao gravar mantém a mudança visível e permite retry da versão mais recente", async () => {
  const storage = armazenamento();
  const salvar = storage.setItem;
  storage.setItem = async () => { throw new Error("sem espaço"); };
  const store = criarColecaoFavoritos(storage);
  await store.hidratar();
  store.alternar(linha(1));
  await store.tentarNovamente();
  assert.equal(store.getSnapshot().linhas.length, 1);
  assert.ok(store.getSnapshot().erroGravacao);
  storage.setItem = salvar;
  await store.tentarNovamente();
  assert.equal(store.getSnapshot().erroGravacao, null);
  assert.equal(lerFavoritos(storage.valores.get(CHAVE_FAVORITOS)).length, 1);
});

test("gravações lentas não sobrescrevem alterações posteriores", async () => {
  const storage = armazenamento();
  let concluir;
  const salvar = storage.setItem;
  let primeira = true;
  storage.setItem = async (...args) => {
    if (primeira) {
      primeira = false;
      await new Promise((resolve) => { concluir = resolve; });
    }
    await salvar(...args);
  };
  const store = criarColecaoFavoritos(storage);
  await store.hidratar();
  store.alternar(linha(1));
  store.alternar(linha(2, "brt"));
  store.remover(linha(1).linhaId);
  concluir();
  await store.tentarNovamente();
  assert.deepEqual(lerFavoritos(storage.valores.get(CHAVE_FAVORITOS)).map((item) => item.linhaId), [linha(2).linhaId]);
});

test("dois consumidores observam a mesma coleção e desfavoritar sincroniza imediatamente", async () => {
  const store = criarColecaoFavoritos(armazenamento());
  await store.hidratar();
  const a = [], b = [];
  const sairA = store.subscribe(() => a.push(store.getSnapshot().linhas.map((item) => item.linhaId)));
  const sairB = store.subscribe(() => b.push(store.getSnapshot().linhas.map((item) => item.linhaId)));
  store.alternar(linha(1));
  store.remover(linha(1).linhaId);
  await store.tentarNovamente();
  assert.deepEqual(a, b);
  assert.deepEqual(a.at(-1), []);
  sairA(); sairB();
});

test("hidratação deduplica UUIDs sem confundir códigos e aceita lista vazia", () => {
  const a = { ...linha(1), adicionadaEm: "2026-10-10T12:00:00Z" };
  const b = { ...linha(2, "brt"), adicionadaEm: a.adicionadaEm };
  assert.equal(lerFavoritos(JSON.stringify([a, a, b])).length, 2);
  assert.deepEqual(lerFavoritos("[]"), []);
  assert.deepEqual(lerFavoritos(null), []);
});
