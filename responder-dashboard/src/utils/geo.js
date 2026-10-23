// Calculates distance in kilometers between two GPS coordinates using the Haversine formula
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// Calculates estimated time of arrival (in minutes) based on average flood boat speed (~22 km/h in flood conditions)
export function calculateEtaMinutes(distKm, speedKmh = 22) {
  if (distKm === null || distKm === undefined) return null;
  const mins = Math.max(1, Math.round((distKm / speedKmh) * 60));
  return mins;
}

export function formatDistanceAndEta(distKm, speedKmh = 22) {
  if (distKm === null || distKm === undefined) return "Distance unknown";
  const eta = calculateEtaMinutes(distKm, speedKmh);
  if (distKm < 1) {
    const meters = Math.round(distKm * 1000);
    return `${meters}m · ~${eta} min ETA`;
  }
  return `${distKm} km · ~${eta} min ETA`;
}
