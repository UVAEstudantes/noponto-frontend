// Responsabilidade: CSS do mapa renderizado dentro da WebView.
// Mantemos este bloco isolado para facilitar ajustes visuais sem tocar na lógica JS do mapa.
export const MAP_WEBVIEW_STYLES = `
    html,body{height:100%;width:100%;margin:0;padding:0;background:#f0f0f0}
    #map{height:100%;width:100%;position:absolute;top:0;left:0}
    .maplibregl-canvas{outline:none}
    .maplibregl-marker{cursor:pointer}
    .maplibregl-popup-content{font-size:12px;line-height:1.4;min-width:200px;margin:0;padding:8px 10px;border-radius:12px;box-shadow:0 3px 10px rgba(0,0,0,.2);background:#fff;color:#111}
    .maplibregl-popup-close-button{display:none}

    .user-container{position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center}
    .user-dot{width:12px;height:12px;background:#38bdf8;border:2.5px solid rgba(255,255,255,.95);border-radius:50%;box-shadow:0 0 0 6px rgba(56,189,248,.14),0 2px 8px rgba(0,0,0,.35);z-index:2}
    .user-arrow{display:none;
      position:absolute;left:50%;top:50%;width:0;height:0;
      border-left:6px solid transparent;border-right:6px solid transparent;
      border-bottom:9px solid #38bdf8;
      transform:translate(-50%,-50%) rotate(var(--h,0deg)) translateY(-15px);
      transform-origin:50% 50%;transition:transform .2s ease-out;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))
    }

    .bus-marker{background:transparent;border:none}
    .bus-inner{position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(var(--h,0deg))}
    /* onibus = gota */
    .bus-blob{
      position:relative;width:16px;height:16px;
      border-radius:50% 50% 50% 0;
      transform:rotate(135deg);
      border:2px solid rgba(255,255,255,.95);
      box-shadow:0 2px 8px rgba(0,0,0,.35), inset 0 -2px 0 rgba(0,0,0,.14)
    }
    .bus-blob:after{
      content:'';position:absolute;left:3px;top:3px;width:5px;height:5px;border-radius:50%;
      background:rgba(255,255,255,.34)
    }
    .bus-arrow{display:none}

    /* ── BRT marker: formato máscara SVG (sino com olhos) ── */
    .brt-marker .bus-blob{display:none}
    .brt-mask{
      position:relative;
      width:14px;height:21px;
      display:flex;align-items:center;justify-content:center;
    }
    .brt-mask svg{
      width:14px;height:21px;
      filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));
      overflow:visible;
    }
    /* BRT: pinça aponta para trás — rotaciona o inner 180° + heading */
    .brt-marker .bus-inner{
      transform:rotate(calc(var(--h,0deg) + 180deg));
    }

    .stop-marker{background:transparent;border:none;opacity:var(--stop-opacity,.75)}
    .stop-train .stop-pin{width:14px;height:14px;border:2px solid #fff;box-shadow:0 0 0 3px var(--stop-color)}
    .train-marker .bus-inner{width:34px;height:34px;transform:rotate(calc(var(--h,0deg) - 90deg))}
    /* trem = pilula fina: frente arredondada, traseira reta */
    .train-marker .bus-blob{
      width:24px;height:10px;transform:none;
      border-radius:3px 9px 9px 3px;
      box-shadow:0 4px 10px rgba(0,0,0,.35),inset 0 -2px 0 rgba(0,0,0,.16)
    }
    .train-marker .bus-blob:after{
      content:'';position:absolute;right:2px;top:2px;width:8px;height:6px;border-radius:5px;
      background:rgba(255,255,255,.32)
    }
    .train-marker .bus-arrow{display:none}
    .stop-pin{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.9);border:1.5px solid rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;position:relative;transform:scale(var(--stop-scale,1));transform-origin:50% 50%;transition:transform .12s ease,opacity .12s ease}
    .stop-core{width:4px;height:4px;border-radius:50%;background:var(--stop-color,#2196F3)}
    .stop-pin:after{content:'';position:absolute;left:50%;top:50%;width:12px;height:12px;border-radius:50%;border:1px solid var(--stop-color,#2196F3);transform:translate(-50%,-50%);opacity:.25;animation:stopPulse 3.2s ease-out infinite}
    @keyframes stopPulse{0%{transform:translate(-50%,-50%) scale(.5);opacity:.2}70%{transform:translate(-50%,-50%) scale(1.35);opacity:0}100%{opacity:0}}
    @keyframes iconPulse{0%{transform:translate(-50%,-50%) scale(.8);opacity:.5}70%{transform:translate(-50%,-50%) scale(1.9);opacity:0}100%{opacity:0}}

    .popup-card{display:flex;flex-direction:column;gap:6px}
    .popup-header{display:flex;align-items:center;gap:8px}
    .popup-indicator{width:28px;height:28px;position:relative;flex:0 0 28px;border-radius:10px;background:#fff;border:1.5px solid currentColor;color:var(--c,#2196F3);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.18)}
    .popup-indicator:after{content:'';position:absolute;left:50%;top:50%;width:26px;height:26px;border-radius:12px;border:2px solid currentColor;transform:translate(-50%,-50%);opacity:.45;animation:iconPulse 2.6s ease-out infinite}
    .popup-indicator svg{width:16px;height:16px;stroke:currentColor;stroke-width:2;fill:none}
    .popup-title{font-weight:700;font-size:14px;color:#111}
    .popup-sub{font-size:12px;color:#555}
    .popup-time{font-size:12px;color:#666}
    .popup-main{display:flex;flex-direction:column;gap:2px}
    .popup-toggle{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:#f3f4f6;color:#1f2937;font-weight:600;font-size:12px;cursor:pointer;user-select:none;align-self:flex-start;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .popup-toggle .toggle-chevron{width:8px;height:8px;border:2px solid currentColor;border-left:0;border-top:0;transform:rotate(45deg);transition:transform .2s ease}
    .popup-toggle.open .toggle-chevron{transform:rotate(-135deg)}
    .popup-details{max-height:0;opacity:0;overflow:hidden;border-top:1px dashed #e5e7eb;padding-top:0;margin-top:2px;transition:max-height .25s ease,opacity .2s ease,padding-top .2s ease}
    .popup-details.open{max-height:160px;opacity:1;padding-top:8px}
    .popup-row{display:flex;gap:6px;color:#555}
    .popup-label{font-weight:600;color:#333;min-width:86px}

    .stop-popup{min-width:180px}
    .stop-title{font-weight:700;font-size:14px;color:#111}
    .stop-sub{font-size:11px;color:#666;margin-top:2px}
    .stop-hint{font-size:11px;color:#6b7280;margin-top:6px}

    .poi-marker{width:28px;height:28px;border-radius:12px;background:#fff;border:1.5px solid var(--c,#f59e0b);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.25);position:relative}
    .poi-marker:after{content:'';position:absolute;left:50%;top:50%;width:26px;height:26px;border-radius:12px;border:2px solid var(--c,#f59e0b);transform:translate(-50%,-50%);opacity:.35;animation:iconPulse 2.4s ease-out infinite}
    .poi-marker svg{width:16px;height:16px;stroke:var(--c,#f59e0b);stroke-width:2;fill:none}
    .poi-distance{padding:4px 10px;border-radius:999px;background:#111;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;display:inline-block;min-width:46px;text-align:center}

    #map.dark-mode .maplibregl-popup-content{background:#1b1f24;color:#e5e7eb}
    #map.dark-mode .maplibregl-popup-tip{border-top-color:#1b1f24}
    #map.dark-mode .popup-title{color:#f3f4f6}
    #map.dark-mode .popup-sub,#map.dark-mode .popup-time,#map.dark-mode .popup-row{color:#cbd5e1}
    #map.dark-mode .popup-label{color:#e5e7eb}
    #map.dark-mode .popup-toggle{background:#2a2f35;color:#e5e7eb}
    #map.dark-mode .popup-details{border-top-color:#3b4047}
    #map.dark-mode .popup-indicator{background:#1b1f24;box-shadow:0 2px 8px rgba(0,0,0,.45)}
    #map.dark-mode .stop-title{color:#f8fafc}
    #map.dark-mode .stop-sub{color:#cbd5e1}
    #map.dark-mode .stop-hint{color:#94a3b8}
    #map.dark-mode .stop-pin{background:rgba(15,23,42,.9);border-color:rgba(148,163,184,.45);box-shadow:0 1px 6px rgba(0,0,0,.65)}
    #map.dark-mode .stop-core{background:var(--stop-color,#38bdf8)}
    #map.dark-mode .stop-pin:after{opacity:.18}
    #map.dark-mode .user-dot{background:#7dd3fc;border-color:rgba(226,232,240,.85);box-shadow:0 0 0 7px rgba(125,211,252,.18),0 2px 10px rgba(0,0,0,.65)}
    #map.dark-mode .user-arrow{border-bottom-color:#7dd3fc;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))}
  `;