import { MAP_WEBVIEW_STYLES } from "./mapStyles";
import { buildMapWebViewScript } from "./mapScript";

// Responsabilidade: montar o HTML completo da WebView do mapa.
// Centralizar aqui evita que mapOSM.tsx acumule HTML/CSS/JS inline gigantes.
export function buildMapHtml(params: {
  latInicial: number;
  lngInicial: number;
  estilosJS: string;
  filtrosMapaJS: string;
  estiloMapaPadrao: string;
}) {
  const script = buildMapWebViewScript(params);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link href="https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.css" rel="stylesheet"/>
  <script src="https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>${MAP_WEBVIEW_STYLES}</style>
</head>
<body>
  <div id="map"></div>
  <script>${script}</script>
</body>
</html>`;
}