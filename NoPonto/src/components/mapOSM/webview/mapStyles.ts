// Responsabilidade: CSS do mapa renderizado dentro da WebView.
// Mantemos este bloco isolado para facilitar ajustes visuais sem tocar na lógica JS do mapa.
export const MAP_WEBVIEW_STYLES = `
    html,body{height:100%;width:100%;margin:0;padding:0;background:#f0f0f0}
    #map{height:100%;width:100%;position:absolute;top:0;left:0}
    .maplibregl-canvas{outline:none}
    .maplibregl-marker{cursor:pointer}
    .maplibregl-popup-content{--popup-surface:#fff;--popup-fg:#0f172a;--popup-muted:#64748b;--popup-border:#e5e7eb;font-size:12px;line-height:1.4;min-width:250px;max-width:min(330px,calc(100vw - 32px));margin:0;padding:15px;border-radius:20px;box-shadow:0 12px 32px rgba(15,23,42,.22);background:var(--popup-surface);color:var(--popup-fg)}
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
    .bus-inner{position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(var(--h,0deg));transition:transform .2s ease-out}
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
    .train-marker .bus-inner{width:34px;height:34px;transform:rotate(calc(var(--h,0deg) - 90deg));transition:transform .2s ease-out}
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
    .train-marker.rail-status-live{filter:drop-shadow(0 2px 5px rgba(0,0,0,.42))}
    .train-marker.rail-status-estimated{filter:drop-shadow(0 0 3px rgba(255,255,255,.9)) drop-shadow(0 2px 5px rgba(0,0,0,.42))}
    .train-marker.rail-status-scheduled .bus-blob{outline:1px dashed rgba(255,255,255,.9);outline-offset:2px}
    .train-marker.rail-selected .bus-blob{box-shadow:0 0 0 3px rgba(255,255,255,.9),0 4px 12px rgba(0,0,0,.5),inset 0 -2px 0 rgba(0,0,0,.16)}
    .rail-status-badge{display:inline-flex;padding:2px 6px;margin-left:5px;border-radius:999px;background:#eef2f7;color:#334155;font-size:10px;font-weight:700;vertical-align:middle}
    .rail-status-badge.live{background:#dcfce7;color:#087a3d}.rail-status-badge.estimated{background:#e0f2fe;color:#075985}.rail-status-badge.scheduled{background:#f1f5f9;color:#475569}
    .popup-rail-primary{font-size:13px;font-weight:700;color:#1f2937}
    .stop-pin{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.9);border:1.5px solid rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;position:relative;transform:scale(var(--stop-scale,1));transform-origin:50% 50%;transition:transform .12s ease,opacity .12s ease}
    .stop-core{width:4px;height:4px;border-radius:50%;background:var(--stop-color,#2196F3)}
    .stop-pin:after{content:'';position:absolute;left:50%;top:50%;width:12px;height:12px;border-radius:50%;border:1px solid var(--stop-color,#2196F3);transform:translate(-50%,-50%);opacity:.25;animation:stopPulse 3.2s ease-out infinite}
    @keyframes stopPulse{0%{transform:translate(-50%,-50%) scale(.5);opacity:.2}70%{transform:translate(-50%,-50%) scale(1.35);opacity:0}100%{opacity:0}}
    @keyframes iconPulse{0%{transform:translate(-50%,-50%) scale(.8);opacity:.5}70%{transform:translate(-50%,-50%) scale(1.9);opacity:0}100%{opacity:0}}

    .popup-card{display:flex;flex-direction:column;gap:10px}
    .popup-header{display:flex;align-items:center;gap:11px}
    .popup-indicator{width:46px;height:46px;position:relative;flex:0 0 46px;border-radius:50%;background:color-mix(in srgb,var(--c,#07883f) 15%,var(--popup-surface));color:color-mix(in srgb,var(--c,#07883f) 82%,var(--popup-fg));display:flex;align-items:center;justify-content:center}
    .popup-indicator:after{content:'';position:absolute;left:50%;top:50%;width:42px;height:42px;border-radius:50%;border:2px solid currentColor;transform:translate(-50%,-50%);opacity:.16;animation:iconPulse 2.6s ease-out infinite}
    .popup-indicator svg{width:24px;height:24px;stroke:currentColor;stroke-width:2;fill:none}
    .popup-title-row{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
    .popup-title{font-weight:800;font-size:18px;color:var(--popup-fg);min-width:0}
    .popup-sub{font-size:12px;color:var(--popup-muted)}
    .popup-service{font-size:10px;color:#64748b}
    .popup-time{font-size:12px;color:var(--popup-muted)}
    .popup-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
    .popup-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--popup-border)}
    .popup-status{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;background:#dcfce7;color:#087a3d;font-size:10px;font-weight:800}
    .popup-status:before{content:'';width:7px;height:7px;border-radius:50%;background:#10b981}
    .popup-meta .popup-time{padding-left:9px;border-left:1px solid var(--popup-border)}
    .popup-vehicle{padding:3px 7px;border-radius:999px;background:color-mix(in srgb,var(--c,#07883f) 14%,var(--popup-surface));color:color-mix(in srgb,var(--c,#07883f) 82%,var(--popup-fg));font-size:11px;font-weight:800;white-space:nowrap}
    .popup-platform{padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--popup-muted) 14%,var(--popup-surface));color:var(--popup-fg);font-size:10px;font-weight:800;white-space:nowrap}
    .popup-train-code{font-size:11px;font-weight:700;color:var(--popup-muted)}
    .popup-toggle{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--popup-muted) 10%,var(--popup-surface));color:var(--popup-fg);font-weight:700;font-size:12px;cursor:pointer;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .popup-toggle .toggle-chevron{width:8px;height:8px;border:2px solid currentColor;border-left:0;border-top:0;transform:rotate(45deg);transition:transform .2s ease}
    .popup-toggle.open .toggle-chevron{transform:rotate(-135deg)}
    .popup-details{max-height:0;opacity:0;overflow:hidden;border-top:1px solid var(--popup-border);padding-top:0;transition:max-height .25s ease,opacity .2s ease,padding-top .2s ease}
    .popup-details.open{max-height:190px;opacity:1;padding-top:10px}
    .popup-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(75px,1fr));gap:0}
    .popup-stat{padding:2px 9px;border-right:1px solid var(--popup-border);min-width:0}.popup-stat:last-child{border-right:0}
    .popup-stat svg{width:17px;height:17px;stroke:var(--popup-fg);margin-bottom:3px}
    .popup-stat-value{font-size:13px;font-weight:800;color:var(--popup-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.popup-stat-label{font-size:10px;color:var(--popup-muted)}
    .popup-row{display:flex;gap:6px;color:#555}
    .popup-label{font-weight:600;color:#333;min-width:86px}

    .stop-popup{min-width:240px;display:flex;align-items:center;gap:12px}
    .stop-popup-icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,#10b981 15%,var(--popup-surface));color:color-mix(in srgb,#10b981 80%,var(--popup-fg));font-size:22px;font-weight:800}
    .stop-popup-icon svg{width:22px;height:22px;stroke:currentColor}
    .stop-popup-copy{flex:1;min-width:0}
    .stop-title{font-weight:800;font-size:15px;color:var(--popup-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .stop-sub{font-size:11px;color:var(--popup-muted);margin-top:2px}
    .stop-chevron{font-size:26px;color:var(--popup-fg);line-height:1}

    .poi-marker{width:28px;height:28px;border-radius:12px;background:#fff;border:1.5px solid var(--c,#f59e0b);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.25);position:relative}
    .poi-marker:after{content:'';position:absolute;left:50%;top:50%;width:26px;height:26px;border-radius:12px;border:2px solid var(--c,#f59e0b);transform:translate(-50%,-50%);opacity:.35;animation:iconPulse 2.4s ease-out infinite}
    .poi-marker svg{width:16px;height:16px;stroke:var(--c,#f59e0b);stroke-width:2;fill:none}
    .poi-distance{padding:4px 10px;border-radius:999px;background:#111;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;display:inline-block;min-width:46px;text-align:center}

    #map.dark-mode .maplibregl-popup-content{--popup-surface:#1b1f24;--popup-fg:#f1f5f9;--popup-muted:#cbd5e1;--popup-border:#3b4047;background:var(--popup-surface);color:var(--popup-fg)}
    #map.dark-mode .maplibregl-popup-tip{border-top-color:#1b1f24}
    #map.dark-mode .popup-title{color:#f3f4f6}
    #map.dark-mode .popup-sub,#map.dark-mode .popup-time,#map.dark-mode .popup-row{color:#cbd5e1}
    #map.dark-mode .popup-label{color:#e5e7eb}
    #map.dark-mode .popup-rail-primary{color:#f3f4f6}
    #map.dark-mode .rail-status-badge.live{background:#12352d;color:#6ee7b7}
    #map.dark-mode .rail-status-badge.estimated{background:#172f46;color:#7dd3fc}
    #map.dark-mode .rail-status-badge.scheduled{background:#334155;color:#e2e8f0}
    #map.dark-mode .popup-toggle{background:#2a2f35;color:#e5e7eb}
    #map.dark-mode .popup-details{border-top-color:#3b4047}
    #map.dark-mode .popup-indicator{box-shadow:0 2px 8px rgba(0,0,0,.45)}
    #map.dark-mode .stop-title{color:#f8fafc}
    #map.dark-mode .stop-sub{color:#cbd5e1}
    #map.dark-mode .stop-hint{color:#94a3b8}
    #map.dark-mode .stop-pin{background:rgba(15,23,42,.9);border-color:rgba(148,163,184,.45);box-shadow:0 1px 6px rgba(0,0,0,.65)}
    #map.dark-mode .stop-core{background:var(--stop-color,#38bdf8)}
    #map.dark-mode .stop-pin:after{opacity:.18}
    #map.dark-mode .user-dot{background:#7dd3fc;border-color:rgba(226,232,240,.85);box-shadow:0 0 0 7px rgba(125,211,252,.18),0 2px 10px rgba(0,0,0,.65)}
    #map.dark-mode .user-arrow{border-bottom-color:#7dd3fc;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))}
  `;
