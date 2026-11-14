import { gateway, gatewayBase } from './gateway';
import { useEffect, useMemo, useState } from 'react';

import { createUnifiedCapabilityReader, selectUnifiedCodes, type UnifiedCapabilities } from './unifiedNetwork';
import { observePhysicalPresence } from './gpsHub';
import { acceptUnified, type UnifiedSnapshot } from './unifiedLocationContract';
import { GPS_POLICY } from './gpsPresentationPolicy';

export const UNIFIED_LOCATION_ENABLED = process.env.EXPO_PUBLIC_UNIFIED_LOCATION_838_ENABLED === 'true';
export const UNIFIED_LOCATION_843_ENABLED = process.env.EXPO_PUBLIC_UNIFIED_LOCATION_843_ENABLED === 'true';
export const UNIFIED_NETWORK_ENABLED = process.env.EXPO_PUBLIC_UNIFIED_NETWORK_ENABLED !== 'false';
const readCapabilities = createUnifiedCapabilityReader(async () => {
  const cancel = new AbortController(); const timer = setTimeout(() => cancel.abort(), 5_000);
  try {
    const response = await gateway.request(gatewayBase().replace(/\/$/, '') + '/veiculos/localizacao-unificada/v1/capabilities', { signal: cancel.signal });
    return response.ok ? await response.json() : null;
  } finally { clearTimeout(timer); }
});
export function useUnifiedLocation(codes: readonly string[]) {
  const [capabilities, setCapabilities] = useState<UnifiedCapabilities | null>(null);
  const hasRoadLines = codes.length > 0;
  useEffect(() => {
    if (!UNIFIED_NETWORK_ENABLED || !hasRoadLines) return;
    let active = true;
    const refresh = () => { void readCapabilities().then(value => { if (active) setCapabilities(value); }); };
    refresh(); const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [hasRoadLines]);
  const legacy = [UNIFIED_LOCATION_ENABLED ? '838' : '', UNIFIED_LOCATION_843_ENABLED ? '843' : ''].filter(Boolean);
  const selected = selectUnifiedCodes(codes, UNIFIED_NETWORK_ENABLED ? capabilities : null, legacy).join(',');
  const [snapshots, setSnapshots] = useState<Record<string, UnifiedSnapshot>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setSnapshots(previous => Object.fromEntries(Object.entries(previous).filter(([code]) => selected.split(',').includes(code))));
    if (!selected) return;
    let active = true;
    const stop = observePhysicalPresence(Symbol('unified-map'), selected.split(',').map(c => `unified:${c}`), raw => {
      if (!active) return;
      if (raw && typeof raw === 'object' && 'unifiedLocationUnavailable' in raw) {
        const code = (raw as { lineCode?: string }).lineCode;
        setSnapshots(previous => { if (!code) return {}; const next = { ...previous }; delete next[code]; return next; }); return;
      }
      const code = (raw as UnifiedSnapshot | null)?.lineCode;
      if (!code || !selected.split(',').includes(code)) return;
      setSnapshots(previous => {
        if (!acceptUnified(raw, previous[code] ?? null)) return previous;
        const next = { ...previous, [code]: raw };
        if (__DEV__) {
          const diagnostics = globalThis as typeof globalThis & { __nopontoUnifiedSnapshot?: UnifiedSnapshot; __nopontoUnifiedSnapshots?: Record<string, UnifiedSnapshot> };
          diagnostics.__nopontoUnifiedSnapshot = raw; diagnostics.__nopontoUnifiedSnapshots = next;
        }
        return next;
      });
    });
    return () => { active = false; stop(); };
  }, [selected]);
  // Changing selected lines must not expose a late previous-cohort result.
  const current = useMemo(()=>Object.values(snapshots).filter(s => selected.split(',').includes(s.lineCode)),[snapshots,selected]);
  // Age text belongs to the WebView clock. React only wakes at validity boundaries.
  useEffect(()=>{
    const at=Date.now();setNow(at);
    const deadlines=current.flatMap(s=>s.vehicles.flatMap(v=>[
      ...[GPS_POLICY.currentSpeedMs,GPS_POLICY.baseProjectionMs,GPS_POLICY.coherentProjectionMs,GPS_POLICY.delayedMs,GPS_POLICY.attenuatedMs,GPS_POLICY.publicMs+1].map(t=>Date.parse(v.location.physicalAt)+t),Date.parse(v.location.validUntil),
      ...(v.operational?[Date.parse(v.operational.timestampGps)+60000,Date.parse(v.operational.timestampGps)+180000]:[]),
      ...(v.line.validatedAt?[Date.parse(v.line.validatedAt)+600000]:[]),
    ])).filter(t=>t>at).sort((a,b)=>a-b);
    const timers=[...new Set(deadlines)].map(t=>setTimeout(()=>setNow(Date.now()),t-at+1));
    return ()=>timers.forEach(clearTimeout);
  },[current]);
  return { snapshots: current, now:Math.max(now,Date.now()) };
}
