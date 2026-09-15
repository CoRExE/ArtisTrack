import { SQLiteDatabase } from 'expo-sqlite';
import { Route, Stop, StopGroup, Departure, RouteDirection, RouteStop, TimetableSlot, RouteCategory } from '../types/gtfs';

/**
 * Calcule la distance en mètres entre deux coordonnées géodésiques (Haversine).
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Formate une couleur hexadécimale en s'assurant qu'elle commence par '#'.
 */
export function formatHexColor(color?: string, fallback = '#134785'): string {
  if (!color) return fallback;
  const clean = color.trim().replace(/^#/, '');
  return clean ? `#${clean}` : fallback;
}

/**
 * Récupère les identifiants de services (calendrier) actifs pour une date donnée.
 */
export async function getActiveServicesForDate(
  db: SQLiteDatabase,
  targetDate: Date
): Promise<string[]> {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekdayCol = weekdays[targetDate.getDay()];

  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  let dateStr = `${y}${m}${d}`;

  // Vérifier si la date est comprise dans la plage de validité du GTFS
  const range = await db.getFirstAsync<{ min_date: string; max_date: string }>(
    'SELECT MIN(start_date) as min_date, MAX(end_date) as max_date FROM calendar'
  );

  if (range && range.min_date && range.max_date) {
    if (dateStr < range.min_date || dateStr > range.max_date) {
      // Date en dehors du calendrier courant : on sélectionne une date représentative
      // avec le même jour de la semaine dans la période active
      const fallbackRow = await db.getFirstAsync<{ date: string }>(
        `SELECT start_date as date FROM calendar WHERE ${weekdayCol} = 1 LIMIT 1`
      );
      if (fallbackRow?.date) {
        dateStr = fallbackRow.date;
      }
    }
  }

  const query = `
    SELECT service_id FROM calendar
    WHERE start_date <= ? AND end_date >= ? AND ${weekdayCol} = 1
      AND service_id NOT IN (
        SELECT service_id FROM calendar_dates WHERE date = ? AND exception_type = 2
      )
    UNION
    SELECT service_id FROM calendar_dates
    WHERE date = ? AND exception_type = 1
  `;

  const rows = await db.getAllAsync<{ service_id: string }>(query, [
    dateStr,
    dateStr,
    dateStr,
    dateStr,
  ]);

  return rows.map((r) => r.service_id);
}

/**
 * Convertit une chaîne "HH:MM:SS" en secondes depuis minuit.
 */
function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

/**
 * Récupère les prochains départs pour un ou plusieurs arrêts (ex: tous les quais d'une même gare).
 */
export async function getNextDepartures(
  db: SQLiteDatabase,
  stopIds: string[],
  targetDate: Date = new Date(),
  limit: number = 20
): Promise<Departure[]> {
  if (stopIds.length === 0) return [];

  const activeServices = await getActiveServicesForDate(db, targetDate);
  if (activeServices.length === 0) return [];

  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  const seconds = String(targetDate.getSeconds()).padStart(2, '0');
  const currentTimeStr = `${hours}:${minutes}:${seconds}`;
  const currentSeconds = timeStrToSeconds(currentTimeStr);

  const stopPlaceholders = stopIds.map(() => '?').join(',');
  const svcPlaceholders = activeServices.map(() => '?').join(',');

  const sql = `
    SELECT
      st.trip_id,
      r.route_id,
      r.route_short_name,
      r.route_long_name,
      r.route_color,
      r.route_text_color,
      COALESCE(NULLIF(t.trip_headsign, ''), r.route_long_name) as trip_headsign,
      st.departure_time,
      s.stop_id,
      s.stop_name
    FROM stop_times st
    JOIN trips t ON st.trip_id = t.trip_id
    JOIN routes r ON t.route_id = r.route_id
    JOIN stops s ON st.stop_id = s.stop_id
    WHERE st.stop_id IN (${stopPlaceholders})
      AND t.service_id IN (${svcPlaceholders})
      AND st.departure_time >= ?
    ORDER BY st.departure_time ASC
    LIMIT ?
  `;

  const params = [...stopIds, ...activeServices, currentTimeStr, limit];
  const rows = await db.getAllAsync<{
    trip_id: string;
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    route_color: string;
    route_text_color: string;
    trip_headsign: string;
    departure_time: string;
    stop_id: string;
    stop_name: string;
  }>(sql, params as any[]);

  return rows.map((r) => {
    const depSec = timeStrToSeconds(r.departure_time);
    const diffMin = Math.max(0, Math.floor((depSec - currentSeconds) / 60));

    // Normaliser l'affichage de l'heure si > 24h
    let displayTime = r.departure_time.substring(0, 5);
    const h = parseInt(displayTime.substring(0, 2), 10);
    if (h >= 24) {
      displayTime = `${String(h - 24).padStart(2, '0')}:${displayTime.substring(3)}`;
    }

    return {
      trip_id: r.trip_id,
      route_id: r.route_id,
      route_short_name: r.route_short_name,
      route_long_name: r.route_long_name,
      route_color: formatHexColor(r.route_color, '#E30613'),
      route_text_color: formatHexColor(r.route_text_color, '#FFFFFF'),
      trip_headsign: r.trip_headsign,
      departure_time: displayTime,
      minutes_remaining: diffMin,
      stop_id: r.stop_id,
      stop_name: r.stop_name,
    };
  });
}

/**
 * Recherche des arrêts par nom avec regroupement des quais / directions.
 */
export async function searchStops(
  db: SQLiteDatabase,
  query: string,
  userLocation?: { latitude: number; longitude: number } | null,
  limit: number = 30
): Promise<StopGroup[]> {
  const cleanQuery = query.trim().replace(/[-_']/g, ' ');
  const words = cleanQuery.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const whereConditions = words.map(() => 'LOWER(stop_name) LIKE ?').join(' AND ');
  const params = words.map((w) => `%${w}%`);

  const sql = `
    SELECT
      stop_id,
      stop_name,
      stop_lat,
      stop_lon,
      location_type
    FROM stops
    WHERE (location_type = 0 OR location_type = '' OR location_type IS NULL)
      AND ${whereConditions}
    ORDER BY stop_name ASC
  `;

  const rows = await db.getAllAsync<Stop>(sql, params);

  // Regroupement par nom d'arrêt pour éviter les doublons de quais
  const groupsMap = new Map<string, StopGroup>();

  for (const row of rows) {
    const existing = groupsMap.get(row.stop_name);
    if (existing) {
      existing.child_stop_ids.push(row.stop_id);
    } else {
      let distance: number | undefined;
      if (userLocation) {
        distance = calculateDistanceMeters(
          userLocation.latitude,
          userLocation.longitude,
          row.stop_lat,
          row.stop_lon
        );
      }
      groupsMap.set(row.stop_name, {
        stop_name: row.stop_name,
        stop_lat: row.stop_lat,
        stop_lon: row.stop_lon,
        child_stop_ids: [row.stop_id],
        distance_meters: distance,
      });
    }
  }

  let result = Array.from(groupsMap.values());

  if (userLocation) {
    result.sort((a, b) => (a.distance_meters || 999999) - (b.distance_meters || 999999));
  }

  return result.slice(0, limit);
}

/**
 * Récupère les arrêts les plus proches de la position de l'utilisateur.
 */
export async function getNearbyStops(
  db: SQLiteDatabase,
  userLat: number,
  userLon: number,
  limit: number = 15
): Promise<StopGroup[]> {
  const sql = `
    SELECT stop_id, stop_name, stop_lat, stop_lon
    FROM stops
    WHERE (location_type = 0 OR location_type = '' OR location_type IS NULL)
      AND stop_lat IS NOT NULL
      AND stop_lon IS NOT NULL
  `;

  const rows = await db.getAllAsync<Stop>(sql);
  const groupsMap = new Map<string, StopGroup>();

  for (const row of rows) {
    const dist = calculateDistanceMeters(userLat, userLon, row.stop_lat, row.stop_lon);
    const existing = groupsMap.get(row.stop_name);
    if (existing) {
      existing.child_stop_ids.push(row.stop_id);
      if (dist < (existing.distance_meters || 999999)) {
        existing.distance_meters = dist;
        existing.stop_lat = row.stop_lat;
        existing.stop_lon = row.stop_lon;
      }
    } else {
      groupsMap.set(row.stop_name, {
        stop_name: row.stop_name,
        stop_lat: row.stop_lat,
        stop_lon: row.stop_lon,
        child_stop_ids: [row.stop_id],
        distance_meters: dist,
      });
    }
  }

  const sorted = Array.from(groupsMap.values()).sort(
    (a, b) => (a.distance_meters || 0) - (b.distance_meters || 0)
  );

  return sorted.slice(0, limit);
}

/**
 * Récupère la liste de toutes les lignes du réseau avec possibilité de filtre par catégorie.
 */
export async function getRoutes(
  db: SQLiteDatabase,
  categoryFilter?: RouteCategory
): Promise<Route[]> {
  let sql = `
    SELECT
      route_id,
      agency_id,
      route_short_name,
      route_long_name,
      route_desc,
      route_type,
      route_color,
      route_text_color,
      route_sort_order,
      category
    FROM routes
  `;
  const params: any[] = [];

  if (categoryFilter) {
    sql += ' WHERE category = ?';
    params.push(categoryFilter);
  }

  sql += ' ORDER BY route_sort_order ASC, route_short_name ASC';

  const rows = await db.getAllAsync<Route>(sql, params);
  return rows.map((r) => ({
    ...r,
    route_color: formatHexColor(r.route_color, '#E30613'),
    route_text_color: formatHexColor(r.route_text_color, '#FFFFFF'),
  }));
}

/**
 * Récupère les directions et arrêts ordonnés pour une ligne donnée.
 */
export async function getRouteDirections(
  db: SQLiteDatabase,
  routeId: string
): Promise<RouteDirection[]> {
  // Trouver les directions disponibles
  const directionsRows = await db.getAllAsync<{ direction_id: number }>(
    'SELECT DISTINCT direction_id FROM trips WHERE route_id = ? ORDER BY direction_id ASC',
    [routeId]
  );

  const directions: RouteDirection[] = [];

  for (const dir of directionsRows) {
    // Trouver le trajet représentatif ayant le plus d'arrêts
    const bestTrip = await db.getFirstAsync<{ trip_id: string; trip_headsign: string }>(
      `
      SELECT t.trip_id, t.trip_headsign, COUNT(st.stop_id) as stop_count
      FROM trips t
      JOIN stop_times st ON t.trip_id = st.trip_id
      WHERE t.route_id = ? AND t.direction_id = ?
      GROUP BY t.trip_id
      ORDER BY stop_count DESC
      LIMIT 1
      `,
      [routeId, dir.direction_id]
    );

    if (bestTrip) {
      const stops = await db.getAllAsync<RouteStop>(
        `
        SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, st.stop_sequence
        FROM stop_times st
        JOIN stops s ON st.stop_id = s.stop_id
        WHERE st.trip_id = ?
        ORDER BY st.stop_sequence ASC
        `,
        [bestTrip.trip_id]
      );

      const dest = bestTrip.trip_headsign || (stops.length > 0 ? stops[stops.length - 1].stop_name : 'Direction');

      directions.push({
        direction_id: dir.direction_id,
        destination: dest,
        stops,
      });
    }
  }

  return directions;
}

/**
 * Récupère la grille horaire complète d'une ligne pour un arrêt donné sur la journée.
 */
export async function getTimetableForStopAndRoute(
  db: SQLiteDatabase,
  stopIds: string[],
  routeId: string,
  directionId?: number,
  targetDate: Date = new Date()
): Promise<TimetableSlot[]> {
  if (stopIds.length === 0) return [];

  const activeServices = await getActiveServicesForDate(db, targetDate);
  if (activeServices.length === 0) return [];

  const svcPlaceholders = activeServices.map(() => '?').join(',');
  const stopPlaceholders = stopIds.map(() => '?').join(',');

  // Inclure tous les quais de cet arrêt ayant le même nom
  let targetStopIds = stopIds;
  try {
    const sameNameStops = await db.getAllAsync<{ stop_id: string }>(
      `SELECT stop_id FROM stops WHERE stop_name IN (SELECT stop_name FROM stops WHERE stop_id IN (${stopPlaceholders}))`,
      stopIds
    );
    if (sameNameStops.length > 0) {
      targetStopIds = Array.from(new Set([...stopIds, ...sameNameStops.map((s) => s.stop_id)]));
    }
  } catch {}

  const finalStopPlaceholders = targetStopIds.map(() => '?').join(',');

  let sql = `
    SELECT
      st.departure_time,
      t.trip_headsign,
      t.trip_id
    FROM stop_times st
    JOIN trips t ON st.trip_id = t.trip_id
    WHERE st.stop_id IN (${finalStopPlaceholders})
      AND t.route_id = ?
      AND t.service_id IN (${svcPlaceholders})
  `;
  const params: any[] = [...targetStopIds, routeId, ...activeServices];

  if (directionId !== undefined) {
    sql += ' AND t.direction_id = ?';
    params.push(directionId);
  }

  sql += ' ORDER BY st.departure_time ASC';

  const rows = await db.getAllAsync<{
    departure_time: string;
    trip_headsign: string;
    trip_id: string;
  }>(sql, params);

  return rows.map((r) => {
    let displayTime = r.departure_time.substring(0, 5);
    const h = parseInt(displayTime.substring(0, 2), 10);
    if (h >= 24) {
      displayTime = `${String(h - 24).padStart(2, '0')}:${displayTime.substring(3)}`;
    }
    return {
      departure_time: displayTime,
      trip_headsign: r.trip_headsign,
      trip_id: r.trip_id,
    };
  });
}

/**
 * Récupère le tracé géographique (points GPS) pour une ligne et direction données.
 */
export async function getRouteShape(
  db: SQLiteDatabase,
  routeId: string,
  directionId: number = 0
): Promise<{ latitude: number; longitude: number }[]> {
  try {
    const trip = await db.getFirstAsync<{ shape_id: string }>(
      'SELECT shape_id FROM trips WHERE route_id = ? AND direction_id = ? AND shape_id IS NOT NULL LIMIT 1',
      [routeId, directionId]
    );
    if (!trip?.shape_id) return [];

    const rows = await db.getAllAsync<{ shape_pt_lat: number; shape_pt_lon: number }>(
      'SELECT shape_pt_lat, shape_pt_lon FROM shapes WHERE shape_id = ? ORDER BY shape_pt_sequence ASC',
      [trip.shape_id]
    );

    return rows.map((r) => ({
      latitude: r.shape_pt_lat,
      longitude: r.shape_pt_lon,
    }));
  } catch {
    return [];
  }
}
