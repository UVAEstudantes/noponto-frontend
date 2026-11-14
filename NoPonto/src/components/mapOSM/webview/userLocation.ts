// Ship source as data: Hermes does not preserve executable Function.toString() source.
export const USER_LOCATION_FILTER_JS = String.raw`(function createUserLocationFilter() {
  let last = null;
  let watermark = 0;
  return (data, now = Date.now()) => {
    const lat = data.userLocation[0], lng = data.userLocation[1];
    const timestamp = data.timestamp;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180
      || !Number.isFinite(timestamp) || timestamp <= watermark || timestamp < now - 30000 || timestamp > now + 10000) return null;
    watermark = timestamp;
    const accuracy = data.accuracy == null ? 50 : data.accuracy;
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return null;
    const next = {lat, lng, timestamp, accuracy, snap: false};
    if (!last) { next.snap = true; last = next; return next; }
    const seconds = (timestamp - last.timestamp) / 1000;
    const dx = ((lng - last.lng + 540) % 360 - 180) * Math.cos((lat + last.lat) * Math.PI / 360);
    const distance = Math.hypot(lat - last.lat, dx) * 111320;
    if (distance > seconds * 100 + accuracy + last.accuracy) return null;
    // Small uncertainty-sized jitter stays still; elapsed time still accumulates for real movement.
    const moving = data.speed != null && Number.isFinite(data.speed) && data.speed >= 0.8;
    const noise = moving ? 1 : Math.max(1.5, Math.min(6, accuracy * 0.35));
    if (distance < noise) return null;
    // Resume from a fresh fix directly; do not animate a stale path after backgrounding.
    const snap = seconds > 15;
    const gain = snap ? 1 : Math.max(0.35, Math.min(0.85, seconds / (seconds + accuracy / 10)));
    next.lat = last.lat + (lat - last.lat) * gain;
    next.lng = last.lng + ((lng - last.lng + 540) % 360 - 180) * gain;
    last = next;
    next.snap = snap;
    return next;
  };
})()`;
