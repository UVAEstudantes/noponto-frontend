const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness, nodes } = require("../../scripts/interface-test-harness.cjs");
test("cinco abas: Perfil antes de Rotinas, Mapa central e links legados preservados em 320/360/400dp", () => {
  for (const width of [320, 360, 400]) {
    const routes = [];
    const h = harness(
      "src/components/NavBar.tsx",
      {
        "./NavBarIcon": { __esModule: true, default: "NavBarIcon" },
        "./tutorial/TutorialProvider": { useTutorial: () => ({ step: null }) },
        "./tutorial/TutorialTarget": { __esModule: true, default: "Target" },
        "@/src/hooks/useTema": { useTema: () => ({ cores: {} }) },
        "expo-router": {
          router: { navigate: (r) => routes.push(r) },
          usePathname: () => "/perfil",
        },
        "react-native-safe-area-context": {
          useSafeAreaInsets: () => ({ bottom: 20 }),
        },
        "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" },
      },
      width,
    );
    const t = h.render();
    const buttons = nodes(t).filter((n) => n.type === "Pressable");
    assert.deepEqual(
      buttons.map((n) => n.props.accessibilityLabel),
      [
        "Ir para Perfil",
        "Ir para Rotinas",
        "Ir para Mapa",
        "Ir para Linhas",
        "Ir para Mais",
      ],
    );
    assert.ok(buttons.every((n) => n.props.style.width >= 44));
    assert.equal(
      buttons.reduce((s, b) => s + b.props.style.width, 0),
      width,
    );
    for (const b of buttons.slice(1)) b.props.onPress();
    assert.deepEqual(routes, ["/favoritos", "/", "/linhas", "/configuracao"]);
    assert.equal(buttons[0].props.accessibilityState.selected, true);
  }
  const route = fs.readFileSync(
    path.resolve(__dirname, "../../app/favoritos.tsx"),
    "utf8",
  );
  assert.match(route, /features\/rotinas\/RotinasTela/);
  const layout = fs.readFileSync(
    path.resolve(__dirname, "../../app/_layout.tsx"),
    "utf8",
  );
  assert.match(layout, /name="perfil"/);
});

test("Mapa fica integrado à barra, sem rótulo visual e com ícone centralizado", () => {
  const h = harness("src/components/NavBar.tsx", {
    "./NavBarIcon": { __esModule: true, default: "NavBarIcon" },
    "./tutorial/TutorialProvider": { useTutorial: () => ({}) },
    "./tutorial/TutorialTarget": { __esModule: true, default: "Target" },
    "@/src/hooks/useTema": { useTema: () => ({ cores: {} }) },
    "expo-router": { router: { navigate() {} }, usePathname: () => "/" },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ bottom: 24 }),
    },
    "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" },
  });
  const tree = h.render();
  const mapa = nodes(tree).find(
    (n) => n.props.accessibilityLabel === "Ir para Mapa",
  );
  assert.equal(nodes(mapa).filter((n) => n.type === "Text").length, 0);
  const circle = nodes(mapa).find(
    (n) => n.props.style?.backgroundColor === "#FFC107",
  );
  assert.equal(circle.props.style.top, -6);
  assert.equal(circle.props.style.alignItems, "center");
  assert.equal(circle.props.style.justifyContent, "center");
  assert.equal(circle.props.style.top + circle.props.style.height, 44);
  assert.ok(mapa.props.style.minHeight >= 44);
});
test("Configurações reserva altura real da barra, inset inferior e folga de12dp", () => {
  const ts = require("typescript");
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../app/configuracao.tsx"),
    "utf8",
  );
  const sf = ts.createSourceFile(
    "config.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let expr;
  function walk(n) {
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === "paddingBottom")
      expr = n.initializer.getText(sf);
    ts.forEachChild(n, walk);
  }
  walk(sf);
  const altura = require("../constants/navegacao.ts").ALTURA_NAVBAR;
  for (const bottom of [0, 16, 24, 48])
    assert.equal(
      require("node:vm").runInNewContext(expr, {
        ALTURA_NAVBAR: altura,
        insets: { bottom },
      }),
      altura + bottom + 12,
    );
  assert.match(source, /edges=\{\["top", "left", "right"\]\}/);
});

test("curva mantém folga simétrica de7dp sem mover o círculo em320/360/400dp", () => {
  for (const width of [320, 360, 400]) {
    const h = harness(
      "src/components/NavBar.tsx",
      {
        "./NavBarIcon": { __esModule: true, default: "NavBarIcon" },
        "./tutorial/TutorialProvider": { useTutorial: () => ({}) },
        "./tutorial/TutorialTarget": { __esModule: true, default: "Target" },
        "@/src/hooks/useTema": { useTema: () => ({ cores: {} }) },
        "expo-router": { router: { navigate() {} }, usePathname: () => "/" },
        "react-native-safe-area-context": {
          useSafeAreaInsets: () => ({ bottom: 24 }),
        },
        "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" },
      },
      width,
    );
    const tree = h.render();
    const d = nodes(tree).find((n) => n.type === "Path").props.d;
    const arc = d.match(/A (\d+) (\d+) 0 0 0 ([\d.]+) ([\d.]+)/);
    assert.ok(arc);
    assert.equal(Number(arc[1]) - 25, 7);
    assert.equal(Number(arc[2]), 32);
    assert.equal(Number(arc[3]) - width / 2, 32);
    assert.equal(Number(arc[4]) - 14, 19);
    assert.ok(d.includes(`${width / 2 - 32} 33 A`));
    assert.ok(d.includes(`L ${width / 2 - 49} 14 C`));
    assert.ok(d.includes(`${width / 2 + 49} 14 L`));
  }
});

function iconHarness() {
  const calls = [];
  let reduced = false;
  class Value {
    constructor(value) {
      this.value = value;
    }
    setValue(value) {
      this.value = value;
    }
    stopAnimation() {}
    interpolate(config) {
      return { value: this, ...config };
    }
  }
  const animated = {
    Value,
    View: "Animated.View",
    timing(value, config) {
      return {
        start() {
          calls.push(config);
          value.setValue(config.toValue);
        },
        stop() {},
      };
    },
    sequence(animations) {
      return {
        start() {
          animations.forEach((a) => a.start());
        },
        stop() {},
      };
    },
  };
  const h = harness("src/components/NavBarIcon.tsx", {
    "@/src/hooks/useTema": {
      useTema: () => ({
        cores: { fundoNav: "#fff", iconeSecundario: "#777" },
        temaAtual: "claro",
      }),
    },
    "./demo/InterfaceDemo": { useMovimentoReduzido: () => reduced },
    "react-native": {
      Animated: animated,
      Easing: { out: (x) => x, inOut: (x) => x, quad: "quad" },
    },
    "react-native-svg": {
      __esModule: true,
      default: "Svg",
      Circle: "Circle",
      G: "G",
      Path: "Path",
    },
  });
  return {
    h,
    calls,
    setReduced: (value) => {
      reduced = value;
    },
  };
}

test("Ícones laterais mantêm caixa e alinhamento, com fade180ms", () => {
  const { h, calls } = iconHarness();
  let props = { href: "/perfil", Icon: "Outline", active: false };
  let tree = h.render(props);
  h.flushEffects();
  calls.length = 0;
  tree = h.render({ ...props, active: true });
  h.flushEffects();
  assert.deepEqual(
    calls.map((c) => [c.toValue, c.duration, c.useNativeDriver]),
    [[1, 180, true]],
  );
  assert.equal(tree.props.style.width, 22);
  assert.equal(tree.props.style.height, 22);
  assert.equal(tree.props.style.transform, undefined);
  for (const href of ["/perfil", "/favoritos", "/linhas", "/configuracao"]) {
    tree = h.render({ ...props, href, active: true });
    const filled = nodes(tree).find((n) => typeof n.type === "function");
    const svg = filled.type(filled.props);
    assert.equal(svg.props.width, 22);
    assert.equal(svg.props.height, 22);
    assert.equal(svg.props.fill, "#FFC107");
    assert.equal(svg.props.stroke, "none");
    assert.ok(
      nodes(svg).every((n) => !n.props.stroke || n.props.stroke === "none"),
    );
    const inactive = nodes(tree).find((n) => n.type === "Outline");
    assert.equal(inactive.props.color, "#777");
    assert.equal(inactive.props.strokeWidth, 2);
    assert.equal(inactive.props.fill, undefined);
    assert.ok(
      nodes(svg).filter((n) => n.type === "Path" || n.type === "Circle")
        .length >= 2,
    );
  }
  h.render({ ...props, active: false });
  h.flushEffects();
  assert.equal(calls.at(-1).toValue, 0);
});

test("pin sobe3.5dp e volta uma vez; novo toque repete, render comum não repete e movimento reduzido fica imóvel", () => {
  const { h, calls, setReduced } = iconHarness();
  const props = { href: "/", Icon: "MapPinned", active: true, feedback: 0 };
  let tree = h.render(props);
  h.flushEffects();
  assert.deepEqual(
    calls.slice(-2).map((c) => [c.toValue, c.duration]),
    [
      [-3.5, 90],
      [0, 110],
    ],
  );
  assert.equal(tree.props.style.transform[0].translateY.value, 0);
  const icon = nodes(tree).find((n) => n.type === "MapPinned");
  assert.ok(icon);
  assert.equal(icon.props.color, "#302600");
  assert.equal(icon.props.size, 26);
  assert.equal(icon.props.strokeWidth, 2);
  assert.equal(icon.props.fill, undefined);
  const filledPin = nodes(tree).find((n) => n.type === "Path");
  assert.equal(filledPin.props.fill, "#302600");
  assert.match(filledPin.props.d, /^M18 8c0 3\.613/);
  assert.equal(
    nodes(tree).find((n) => n.type === "Circle").props.fill,
    "#FFC107",
  );
  const count = calls.length;
  h.render(props);
  h.flushEffects();
  assert.equal(calls.length, count);
  h.render({ ...props, feedback: 1 });
  h.flushEffects();
  assert.equal(calls.length, count + 2);
  setReduced(true);
  tree = h.render({ ...props, feedback: 2 });
  h.flushEffects();
  assert.equal(calls.length, count + 2);
  assert.equal(tree.props.style.transform[0].translateY.value, 0);
  setReduced(false);
  tree = h.render({ ...props, active: false, feedback: 3 });
  h.flushEffects();
  assert.equal(calls.at(-1).toValue, 0);
  const fillLayer = nodes(tree).find(
    (n) => n.props.style?.position === "absolute",
  );
  assert.equal(fillLayer.props.style.opacity.value, 0);
});

test("Indicador superior desliza200ms, recorta o Mapa e respeita movimento reduzido", () => {
  for (const width of [320, 360, 400]) {
    const calls = [];
    let reduced = false;
    class Value {
      constructor(value) {
        this.value = value;
      }
      setValue(value) {
        this.value = value;
      }
      stopAnimation() {}
    }
    const h = harness(
      "src/components/NavBar.tsx",
      {
        "./NavBarIcon": { __esModule: true, default: "NavBarIcon" },
        "./tutorial/TutorialProvider": { useTutorial: () => ({}) },
        "./tutorial/TutorialTarget": { __esModule: true, default: "Target" },
        "@/src/hooks/useTema": { useTema: () => ({ cores: {} }) },
        "@/src/components/demo/InterfaceDemo": {
          useMovimentoReduzido: () => reduced,
        },
        "expo-router": {
          router: { navigate() {} },
          usePathname: () => "/perfil",
        },
        "react-native-safe-area-context": {
          useSafeAreaInsets: () => ({ bottom: 24 }),
        },
        "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" },
        "react-native": {
          View: "View",
          Pressable: "Pressable",
          Text: "Text",
          useWindowDimensions: () => ({ width }),
          Easing: { out: (x) => x, quad: "quad" },
          Animated: {
            Value,
            View: "Animated.View",
            timing(value, config) {
              return {
                start() {
                  calls.push(config);
                  value.setValue(config.toValue);
                },
              };
            },
          },
        },
      },
      width,
    );
    const render = (index) =>
      h.render({ width, activeIndex: index }, "NavBarIndicator");
    let tree = render(0);
    h.flushEffects();
    const clips = nodes(tree).filter((n) => n.type === "View");
    assert.deepEqual(
      clips.map((n) => [n.props.style.left, n.props.style.width]),
      [
        [0, width / 2 - 49],
        [width / 2 + 49, width / 2 - 49],
      ],
    );
    assert.ok(
      clips.every(
        (n) =>
          n.props.style.top === 1 &&
          n.props.style.overflow === "hidden" &&
          n.props.pointerEvents === "none",
      ),
    );
    const bars = nodes(tree).filter((n) => n.type === "Animated.View");
    assert.ok(
      bars.every(
        (n) => n.props.style.width === 24 && n.props.style.height === 3,
      ),
    );
    assert.equal(
      bars[0].props.style.transform[0].translateX,
      bars[1].props.style.transform[0].translateX,
    );
    assert.equal(calls.at(-1).toValue, width / 10 - 12);
    render(4);
    h.flushEffects();
    assert.deepEqual(calls.at(-1), {
      toValue: width * 0.9 - 12,
      duration: 200,
      easing: "quad",
      useNativeDriver: true,
    });
    tree = render(2);
    h.flushEffects();
    const x = calls.at(-1).toValue;
    assert.equal(x, width / 2 - 12);
    assert.ok(
      x > clips[0].props.style.width && x + 24 < clips[1].props.style.left,
    );
    const count = calls.length;
    render(2);
    h.flushEffects();
    assert.equal(calls.length, count);
    reduced = true;
    tree = render(1);
    h.flushEffects();
    assert.equal(calls.length, count);
    assert.equal(
      nodes(tree).find((n) => n.type === "Animated.View").props.style
        .transform[0].translateX.value,
      width * 0.3 - 12,
    );
    const root = h.render();
    assert.equal(
      nodes(root).filter(
        (n) => n.props.style?.width === 16 && n.props.style?.height === 3,
      ).length,
      0,
    );
  }
});
