import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';
import { Departure, StopGroup } from '../types/gtfs';
import { calculateDistanceMeters, formatHexColor, getNextDepartures } from './artisService';
import { getRouteColor, resolveDestinationTitle } from './apiDumpService';

export const ARTIS_API_BASE =
  'https://p-drne-hub-qrcode-api-euw-wap-gjfnekfqfdgtfxaa.westeurope-01.azurewebsites.net';

const STOPS_CACHE_KEY = '@artistrack_api_stops';
const STOPS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures

export interface ApiStopLine {
  line: string;
  sequence?: number;
  gtfs_line_id?: string;
}

export interface ApiStop {
  id: number;
  name: string;
  longitude: string | number;
  latitude: string | number;
  import_status?: string;
  lines?: ApiStopLine[];
}

export interface ApiPassage {
  is_realtime?: boolean;
  realtime_time?: string;
  theoretical_time?: string;
  countdown_seconds?: number;
  status?: string;
}

export interface ApiDirection {
  display: string;
  next_stops?: string[];
  passages?: ApiPassage[];
}

export interface ApiLine {
  id: string;
  short_name?: string;
  name: string;
  color?: string;
  text_color?: string;
  directions?: ApiDirection[];
}

export interface ApiGtfsUpcoming {
  line_name: string;
  direction: string;
  departure_time: string;
  color?: string;
  next_stops?: string[];
}

export interface ApiDisruption {
  id?: string | number;
  title?: string;
  message?: string;
  severity?: string;
  [key: string]: any;
}

export interface ApiNextPassagesResponse {
  stop_name?: string;
  realtime_source?: string;
  realtime_available?: boolean;
  instant_system_available?: boolean;
  disruptions?: (string | ApiDisruption)[];
  lines?: ApiLine[];
  gtfs_upcoming?: ApiGtfsUpcoming[];
  error?: string;
}

export interface HybridDeparturesResult {
  departures: Departure[];
  isLive: boolean;
  disruptions: string[];
  stopName?: string;
  apiStopId?: number;
}

// Cache en mémoire pour éviter les accès répétés à AsyncStorage
let inMemoryApiStops: ApiStop[] | null = null;
let inMemoryFetchPromise: Promise<ApiStop[]> | null = null;

/**
 * Normalise une chaîne de caractères (retire accents, ponctuation, casse).
 */
export function normalizeStopName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Récupère le catalogue des 443 arrêts physiques de l'API Artis.
 * Utilise le cache AsyncStorage (TTL 24h) et un fallback réseau avec timeout de 5s.
 */
export async function fetchApiStops(forceRefresh = false): Promise<ApiStop[]> {
  if (!forceRefresh && inMemoryApiStops && inMemoryApiStops.length > 0) {
    return inMemoryApiStops;
  }

  if (inMemoryFetchPromise) {
    return inMemoryFetchPromise;
  }

  inMemoryFetchPromise = (async () => {
    try {
      // 1. Essayer de lire depuis AsyncStorage
      if (!forceRefresh) {
        try {
          const cachedJson = await AsyncStorage.getItem(STOPS_CACHE_KEY);
          if (cachedJson) {
            const { timestamp, stops } = JSON.parse(cachedJson);
            if (Date.now() - timestamp < STOPS_CACHE_TTL && Array.isArray(stops) && stops.length > 0) {
              inMemoryApiStops = stops;
              return stops;
            }
          }
        } catch {
          // Ignorer l'erreur de storage (ex: environnement sans storage ou corrompu)
        }
      }

      // 2. Téléchargement depuis l'API Artis
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${ARTIS_API_BASE}/infrastructure/client-front/stops`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Erreur HTTP API Stops: ${response.status}`);
      }

      const stops: ApiStop[] = await response.json();
      if (Array.isArray(stops) && stops.length > 0) {
        inMemoryApiStops = stops;
        await AsyncStorage.setItem(
          STOPS_CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), stops })
        ).catch(() => {});
        return stops;
      }
    } catch (err) {
      console.warn('[ArtisLive] Impossible de charger les arrêts API:', err);
    } finally {
      inMemoryFetchPromise = null;
    }

    return inMemoryApiStops || [];
  })();

  return inMemoryFetchPromise;
}

/**
 * Détecte si une chaîne est une URL ou un identifiant de QR code Artis.
 * Formats acceptés :
 * - https://portail-qrcode.bus-artis.fr/stop/88/slbfgi2
 * - /stop/88/slbfgi2
 * - /stop/88
 * - 88 (numérique)
 */
export function parseQrUrlOrId(input: string): { stopId: number; gtfsStopId?: string } | null {
  if (!input) return null;
  const trimmed = input.trim();

  // URL complète ou chemin
  const match = trimmed.match(/(?:bus-artis\.fr)?\/stop\/(\d+)(?:\/([a-zA-Z0-9_-]+))?/);
  if (match) {
    return {
      stopId: parseInt(match[1], 10),
      gtfsStopId: match[2] || undefined,
    };
  }

  // ID direct numérique
  if (/^\d+$/.test(trimmed)) {
    const id = parseInt(trimmed, 10);
    if (id > 0 && id < 2000) {
      return { stopId: id };
    }
  }

  return null;
}

/**
 * Résout un arrêt API correspondant à un StopGroup (par nom ou proximité GPS).
 */
export async function resolveApiStop(stop: {
  stop_name: string;
  stop_lat?: number;
  stop_lon?: number;
}): Promise<ApiStop | null> {
  const stops = await fetchApiStops();
  if (stops.length === 0) return null;

  const normTarget = normalizeStopName(stop.stop_name);

  // 1. Correspondance exacte par nom normalisé
  let found = stops.find((s) => normalizeStopName(s.name) === normTarget);
  if (found) return found;

  // 2. Correspondance partielle par nom (contient le nom)
  found = stops.find((s) => {
    const norm = normalizeStopName(s.name);
    return norm.includes(normTarget) || normTarget.includes(norm);
  });
  if (found) return found;

  // 3. Correspondance par coordonnées GPS (rayon < 150m)
  if (stop.stop_lat !== undefined && stop.stop_lon !== undefined) {
    let bestDist = 150;
    let bestStop: ApiStop | null = null;

    for (const s of stops) {
      const lat = typeof s.latitude === 'string' ? parseFloat(s.latitude) : s.latitude;
      const lon = typeof s.longitude === 'string' ? parseFloat(s.longitude) : s.longitude;
      if (isNaN(lat) || isNaN(lon)) continue;

      const d = calculateDistanceMeters(stop.stop_lat, stop.stop_lon, lat, lon);
      if (d < bestDist) {
        bestDist = d;
        bestStop = s;
      }
    }

    if (bestStop) return bestStop;
  }

  return null;
}

/**
 * Calcule la différence en minutes entre une heure "HH:MM" et l'heure courante.
 */
function computeMinutesUntil(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;

  const now = new Date();
  const target = new Date(now);
  target.setHours(parts[0], parts[1], 0, 0);

  // Si l'heure est passée (ex: minuit passé), on compte pour demain si écart > 12h
  let diffMs = target.getTime() - now.getTime();
  if (diffMs < -30 * 60 * 1000 && parts[0] < 4) {
    // Bus après minuit
    target.setDate(target.getDate() + 1);
    diffMs = target.getTime() - now.getTime();
  }

  return Math.max(0, Math.round(diffMs / 60000));
}

/**
 * Récupère les prochains passages en temps réel depuis l'API Artis.
 */
export async function fetchLiveDepartures(
  apiStopId: number,
  gtfsStopId?: string
): Promise<{
  departures: Departure[];
  disruptions: string[];
  hasRealtime: boolean;
  stopName?: string;
} | null> {
  const url = gtfsStopId
    ? `${ARTIS_API_BASE}/infrastructure/client-front/stops/${apiStopId}/${encodeURIComponent(
        gtfsStopId
      )}/next-passages`
    : `${ARTIS_API_BASE}/infrastructure/client-front/stops/${apiStopId}/next-passages`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const data: ApiNextPassagesResponse = await res.json();
    if (!data) return null;

    const departures: Departure[] = [];
    const seenKeys = new Set<string>();
    let hasRealtime = false;

    // 1. Parsing des passages en direct par ligne et direction
    if (Array.isArray(data.lines)) {
      for (const line of data.lines) {
        const routeShortName = line.short_name || line.name || '';
        const colors = getRouteColor(routeShortName, line.color);

        if (Array.isArray(line.directions)) {
          for (const dir of line.directions) {
            const headsign = resolveDestinationTitle(routeShortName, dir.display, dir.next_stops);

            if (Array.isArray(dir.passages)) {
              for (const p of dir.passages) {
                const isRealtime = !!p.is_realtime;
                if (isRealtime) hasRealtime = true;

                const displayTime =
                  isRealtime && p.realtime_time
                    ? p.realtime_time.substring(0, 5)
                    : p.theoretical_time
                    ? p.theoretical_time.substring(0, 5)
                    : '--:--';

                const minutesRemaining =
                  p.countdown_seconds !== undefined && p.countdown_seconds !== null && p.countdown_seconds >= 0
                    ? Math.max(0, Math.ceil(p.countdown_seconds / 60))
                    : computeMinutesUntil(displayTime);

                const dedupeKey = `${routeShortName.toUpperCase()}-${displayTime}-${headsign}`;
                seenKeys.add(dedupeKey);

                departures.push({
                  trip_id: `live-${line.id}-${headsign}-${displayTime}-${Math.random().toString(36).substring(2, 6)}`,
                  route_id: line.id,
                  route_short_name: routeShortName,
                  route_long_name: headsign,
                  route_color: colors.bg,
                  route_text_color: colors.text,
                  trip_headsign: headsign,
                  departure_time: displayTime,
                  minutes_remaining: minutesRemaining,
                  stop_id: String(apiStopId),
                  stop_name: data.stop_name || '',
                  is_realtime: isRealtime,
                  countdown_seconds: p.countdown_seconds ?? undefined,
                  status: p.status,
                  theoretical_time: p.theoretical_time ? p.theoretical_time.substring(0, 5) : undefined,
                });
              }
            }
          }
        }
      }
    }

    // 2. Traitement des horaires théoriques retournés par l'API (gtfs_upcoming)
    // Permet d'inclure TOUTES les lignes programmées à cet arrêt (ex: Ligne 2) même sans balise GPS active
    if (Array.isArray(data.gtfs_upcoming)) {
      for (const upcoming of data.gtfs_upcoming) {
        const routeShortName = upcoming.line_name || '';
        const time = upcoming.departure_time ? upcoming.departure_time.substring(0, 5) : '--:--';
        const headsign = resolveDestinationTitle(routeShortName, upcoming.direction, upcoming.next_stops);
        const dedupeKey = `${routeShortName.toUpperCase()}-${time}-${headsign}`;

        // Éviter les doublons si ce passage est déjà présent depuis data.lines
        if (seenKeys.has(dedupeKey)) {
          continue;
        }
        seenKeys.add(dedupeKey);

        const colors = getRouteColor(routeShortName, upcoming.color);
        const minutesRemaining = computeMinutesUntil(time);

        departures.push({
          trip_id: `upcoming-${routeShortName}-${headsign}-${time}-${Math.random().toString(36).substring(2, 6)}`,
          route_id: routeShortName,
          route_short_name: routeShortName,
          route_long_name: headsign,
          route_color: colors.bg,
          route_text_color: colors.text,
          trip_headsign: headsign,
          departure_time: time,
          minutes_remaining: minutesRemaining,
          stop_id: String(apiStopId),
          stop_name: data.stop_name || '',
          is_realtime: false,
        });
      }
    }

    // Tri par délai d'attente croissant
    departures.sort((a, b) => a.minutes_remaining - b.minutes_remaining);

    // Extraction des messages de perturbations
    const disruptions: string[] = [];
    if (Array.isArray(data.disruptions)) {
      for (const d of data.disruptions) {
        if (typeof d === 'string' && d.trim().length > 0) {
          disruptions.push(d.trim());
        } else if (typeof d === 'object' && d !== null) {
          const msg = d.message || d.title;
          if (msg) disruptions.push(String(msg).trim());
        }
      }
    }

    return {
      departures,
      disruptions,
      hasRealtime,
      stopName: data.stop_name,
    };
  } catch (err) {
    // Timeout ou hors-ligne
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Vérifie rapidement la connectivité avec l'API Artis (timeout 2s).
 */
export async function isNetworkAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${ARTIS_API_BASE}/infrastructure/client-front/mobility-services`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Orchestrateur Hybride Strict :
 * - Si le téléphone a Internet et que l'API répond correctement : affiche EXCLUSIVEMENT les résultats de l'API.
 * - Si l'API est inaccessible ou en cas d'absence d'Internet : bascule EXCLUSIVEMENT sur la base SQLite interne.
 * - Aucun mélange de sources, zéro risque de doublons.
 */
export async function getHybridDepartures(
  db: SQLiteDatabase,
  stopGroup: StopGroup,
  targetDate: Date = new Date(),
  limit: number = 25
): Promise<HybridDeparturesResult> {
  try {
    // 1. Résolution de l'arrêt dans le catalogue de l'API
    const apiStop = await resolveApiStop(stopGroup);

    if (apiStop) {
      // 2. Requête vers l'API temps réel Artis
      const live = await fetchLiveDepartures(apiStop.id);

      // Si l'API a répondu correctement (HTTP 200)
      if (live !== null) {
        return {
          departures: live.departures.slice(0, limit),
          isLive: true,
          disruptions: live.disruptions,
          stopName: live.stopName || apiStop.name,
          apiStopId: apiStop.id,
        };
      }
    }
  } catch (err) {
    console.warn('[ArtisHybrid] API non accessible, bascule sur la base interne:', err);
  }

  // 3. Fallback exclusif vers la base SQLite GTFS interne
  try {
    const offlineDeps = await getNextDepartures(
      db,
      stopGroup.child_stop_ids,
      targetDate,
      limit
    );

    return {
      departures: offlineDeps,
      isLive: false,
      disruptions: [],
      stopName: stopGroup.stop_name,
    };
  } catch (err) {
    console.error('[ArtisHybrid] Échec SQL départs:', err);
    return {
      departures: [],
      isLive: false,
      disruptions: [],
      stopName: stopGroup.stop_name,
    };
  }
}
