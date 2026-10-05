export function assinaturaEstruturalParadas(
  mostrarParadas: boolean,
  paradas: readonly { paradaId: string }[],
) {
  return mostrarParadas
    ? `stops:${paradas.map((parada) => parada.paradaId).join(",")}`
    : "stops:off";
}
