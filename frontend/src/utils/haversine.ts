const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function sortByDistance<T extends { latitud: number; longitud: number }>(
  items: T[],
  userLat: number,
  userLng: number,
): (T & { distanciaKm: number })[] {
  return items
    .map((item) => ({
      ...item,
      distanciaKm: haversineKm(userLat, userLng, item.latitud, item.longitud),
    }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
}
