// Pure, dependency-free distance math — no events equivalent. Used to
// opportunistically populate camps.distanceMiles whenever a camp's
// latitude/longitude are known (seed scripts today; not a live geocoding
// integration), same "opportunistic, not live" posture as latitude/longitude
// themselves already have on both events and camps.

export const NETTELHORST_COORDS = { lat: 41.94167, lng: -87.64472 }

const EARTH_RADIUS_MILES = 3958.8

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_MILES * c
}
