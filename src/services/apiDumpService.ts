import * as FileSystem from 'expo-file-system/legacy';
import { Route, RouteCategory, RouteDirection, RouteStop, TimetableSlot } from '../types/gtfs';
import { ARTIS_API_BASE } from './realtimeArtisService';
import { formatHexColor } from './artisService';

const DUMP_FILE = `${FileSystem.documentDirectory}artis_lines_dump.json`;
const META_FILE = `${FileSystem.documentDirectory}artis_lines_meta.json`;
const DUMP_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export interface RawApiSchedule {
  service_period: string;
  departures: string[];
}

export interface RawApiStop {
  name: string;
  sequence: number;
  gtfs_stop_id: string;
  longitude: string;
  latitude: string;
  schedules?: RawApiSchedule[];
}

export interface RawApiLine {
  id: number;
  line: string;
  gtfs_line_id: string;
  category: string | null;
  stops: RawApiStop[];
}

export interface ApiDumpMetadata {
  timestamp: number;
  linesCount: number;
  version: string;
}

// Cache en mémoire pour rapidité d'affichage
let inMemoryLines: RawApiLine[] | null = null;
let inMemoryRoutes: Route[] | null = null;

/**
 * Détermine la catégorie d'une ligne selon son code (1-10, CIT, S, etc.)
 */
export function determineRouteCategory(shortName: string): RouteCategory {
  const upper = shortName.toUpperCase().trim();
  const num = parseInt(upper, 10);

  if (!isNaN(num)) {
    if (num >= 1 && num <= 10) return 'urbaine';
    return 'periurbaine';
  }

  if (
    upper.startsWith('CIT') ||
    upper === 'ACTI' ||
    upper === 'ARTO' ||
    upper === 'ARTOIS' ||
    upper === 'CHEM' ||
    upper.includes('NAV')
  ) {
    return 'navette';
  }

  if (upper.startsWith('S')) {
    return 'scolaire';
  }

  if (upper.startsWith('D')) {
    return 'periurbaine';
  }

  return 'tad';
}

/**
 * Palette de couleurs officielles des lignes du réseau Artis (issues de la charte et du GTFS Artis).
 */
export const ROUTE_COLORS: Record<string, { bg: string; text: string }> = {
  // Lignes urbaines 1 à 10
  '1': { bg: '#4EB9EA', text: '#FFFFFF' }, // Bleu ciel officiel Artis
  '2': { bg: '#9A6918', text: '#FFFFFF' }, // Ocre / Marron
  '3': { bg: '#AFCB08', text: '#1F2937' }, // Vert anis
  '4': { bg: '#DE1419', text: '#FFFFFF' }, // Rouge
  '5': { bg: '#F6C521', text: '#1F2937' }, // Jaune
  '6': { bg: '#34A03C', text: '#FFFFFF' }, // Vert foncé
  '7': { bg: '#F1A824', text: '#FFFFFF' }, // Orange doré
  '8': { bg: '#4B8FB2', text: '#FFFFFF' }, // Bleu ardoise
  '9': { bg: '#894896', text: '#FFFFFF' }, // Violet
  '10': { bg: '#EC6291', text: '#FFFFFF' }, // Rose fuchsia

  // Lignes périurbaines 11 à 18
  '11': { bg: '#FF8000', text: '#FFFFFF' }, // Orange
  '12': { bg: '#2FCC92', text: '#FFFFFF' }, // Menthe / Turquoise
  '13': { bg: '#8000FF', text: '#FFFFFF' }, // Violet vif
  '14': { bg: '#F8B355', text: '#1F2937' }, // Pêche
  '15': { bg: '#0080FF', text: '#FFFFFF' }, // Bleu roi
  '16': { bg: '#00B700', text: '#FFFFFF' }, // Vert vif
  '17': { bg: '#FF0080', text: '#FFFFFF' }, // Rose bonbon
  '18': { bg: '#0000FF', text: '#FFFFFF' }, // Bleu marine

  // Navettes & Citadines
  'CIT1': { bg: '#FF0000', text: '#FFFFFF' }, // Citadine 1 (Rouge)
  'CIT2': { bg: '#00B3B3', text: '#FFFFFF' }, // Citadine 2 (Turquoise)
  'CIT3': { bg: '#00838F', text: '#FFFFFF' }, // Citadine 3 (Bleu canard)
  'ACTI': { bg: '#83C282', text: '#1F2937' }, // Actiparc (Vert clair)
  'ARTO': { bg: '#00B0B2', text: '#FFFFFF' }, // Artoipôle (Turquoise)
  'ARTOIS': { bg: '#00B0B2', text: '#FFFFFF' },
  'CHEM': { bg: '#8E44AD', text: '#FFFFFF' }, // Chemins Croisés (Violet)

  // Lignes TAD / Dimanche
  'D1': { bg: '#2B509F', text: '#FFFFFF' }, // Dimanche D1
  'D2': { bg: '#EC6291', text: '#FFFFFF' }, // Dimanche D2
};

/**
 * Renvoie la couleur officielle et la couleur de texte pour une ligne donnée.
 */
export function getRouteColor(
  shortName: string,
  fallbackColor?: string
): { bg: string; text: string } {
  const clean = (shortName || '').toUpperCase().trim();
  if (ROUTE_COLORS[clean]) {
    return ROUTE_COLORS[clean];
  }
  const category = determineRouteCategory(clean);
  if (category === 'scolaire') {
    return { bg: '#408080', text: '#FFFFFF' };
  }
  if (category === 'urbaine') {
    return { bg: '#4EB9EA', text: '#FFFFFF' };
  }
  if (category === 'periurbaine') {
    return { bg: '#FF8000', text: '#FFFFFF' };
  }
  return {
    bg: formatHexColor(fallbackColor, '#134785'),
    text: '#FFFFFF',
  };
}

/**
 * Titres canoniques reconnus pour les lignes à forte notoriété ou boucles
 */
const KNOWN_ROUTE_TITLES: Record<string, string> = {
  '1': 'Arras Gare Urbaine ↔ Arras Centre Commercial',
  '2': 'St-Nicolas Cruppes ↔ Arras Centre Commercial',
  '3': 'Dainville Mairie ↔ Achicourt Collège Adam de la Halle',
  '4': 'Arras Gare Brassart ↔ Beaurains Centre Commercial',
  '5': 'Arras Gare Urbaine ↔ Arras Willy Brandt',
  '6': 'Dainville ZA ↔ Tilloy-lès-Mofflaines Château d\'eau',
  '7': 'Agny Mairie ↔ Feuchy Les Étangs',
  '8': 'St-Nicolas Cruppes ↔ ZI Est Fleming',
  '9': 'Arras Gare Urbaine ↔ Anzin ZA des Filatiers',
  '10': 'Anzin Cazin ↔ Beaurains Centre Commercial',
  'CIT1': 'Citadine 1 • Aquarena ↔ Centre-Ville',
  'CIT2': 'Citadine 2 • Citadelle ↔ Centre-Ville',
  'CIT3': 'Citadine 3 • Parking Relais Huileries ↔ Gare',
  'ACTI': 'Navette Actiparc • Gare ↔ Actiparc',
  'ARTO': 'Navette Artoipôle • Gare ↔ Parking Relais Royal Variétés',
  'CHEM': 'Navette Chemins Croisés • Gare ↔ Inserre',
  'D1': 'Dimanche D1 • St-Nicolas Cruppes ↔ Arras C. Cial',
  'D2': 'Dimanche D2 • Dainville Mairie ↔ Beaurains C. Cial',
};

/**
 * Dictionnaire statique complet des terminus de chaque ligne et direction du réseau Artis.
 * Permet une résolution instantanée des libellés comme "Aller", "Retour", "1", "2".
 */
const STATIC_DIRECTIONS_MAP: Record<string, string> = {
  '1|1 arras centre commercial': 'Arras Centre Commercial',
  '1|1 arras gare urbaine': 'Arras Gare Quai A',
  '2|2 arras centre commercial': 'Arras Centre Commercial',
  '2|2 st nicolas cruppes': 'St-Nicolas Cruppes',
  '3|3 achicourt college adam de la halle': 'Collège Adam de la Hallle',
  '3|3 dainville mairie': 'Mairie de Dainville',
  '3|za1 actiparc': 'Arras Gare Quai A',
  '4|4 arras gare urbaine': 'Arras Gare Brassart',
  '4|4 beaurains centre commercial': 'Beaurains Centre Commercial',
  '5|5 arras gare urbaine': 'Arras Gare Quai A',
  '5|5 arras willy brandt': 'Willy Brandt',
  '6|1': 'Arras Gare Brassart',
  '6|2': 'Arras Gare Brassart',
  '6|6 dainville za': 'Dainville Zone d\'Activités',
  '6|6 tilloy les mofflaines chateau d\'eau': 'Tilloy Chateau d\'eau',
  '7|1': 'Arras Gare Quai A',
  '7|2': 'Arras Gare Quai A',
  '7|7 agny mairie': 'Agny Mairie',
  '7|7 feuchy les etangs': 'Les Etangs',
  '8|8 arras zi flemming': 'ZI Est Fleming',
  '8|8 st nicolas cruppes': 'St-Nicolas Cruppes',
  '9|9 anzin-st-aubin za des filatiers': 'ZA des Filatiers',
  '9|9 arras gare urbaine': 'Arras Gare Quai A',
  '10|10 anzin st aubin cazin': 'Anzin-St-Aubin Cazin',
  '10|10 arras gare urbaine': 'Arras Gare Brassart',
  '10|10 beaurains centre commercial': 'Beaurains Centre Commercial',
  '11|aller': 'Arras Gare Quai A',
  '11|retour': 'La Targette',
  '12|aller': 'Arras Gare Quai A',
  '12|retour': 'Moulin',
  '13|aller': 'Arras Gare Quai A',
  '13|retour': 'Eglise de Gavrelle',
  '14|aller': 'Arras Gare Quai A',
  '14|retour': 'Eglise d\'Hénin-sur-Cojeul',
  '15|aller': 'Arras Gare Quai A',
  '15|retour': 'Mairie de Boyelles',
  '16|aller': 'Arras Gare Quai A',
  '16|retour': 'Eglise de Ransart',
  '17|aller': 'Arras Gare Quai A',
  '17|retour': 'Rue de Bellacordelle',
  '18|aller': 'Arras Gare Quai A',
  '18|retour': 'Rue de la Liberté',
  'ACTI|za1 actiparc': 'Actiparc (Commios)',
  'ARTO|za2 parking relais royal varietes': 'Parking Relais Royal Variétés',
  'CHEM|za3 chemins croises': 'Arras Gare Quai A',
  'CIT1|1': 'Boucle Centre-Ville / Aquarena',
  'CIT2|1': 'Boucle Centre-Ville / Citadelle',
  'CIT3|1': 'Parking Relais Huileries ↔ Gare',
  'D1|d1 arras centre commercial': 'Arras Centre Commercial',
  'D1|d1 st nicolas cruppes': 'St-Nicolas Cruppes',
  'D2|d2 beaurains centre commercial': 'Beaurains Centre Commercial',
  'D2|d2 dainville mairie': 'Mairie de Dainville',
  'S1|aller': 'Collège Adam de la Hallle',
  'S1|retour': 'Salengro',
  'S10|aller': 'Collège Verlaine',
  'S10|retour': 'Moulin',
  'S11|aller': 'Collège F. Mitterrand',
  'S11|retour': 'Eglise de Ransart',
  'S12|aller': 'Collège Adam de la Hallle',
  'S12|retour': 'Rue de Bellacordelle',
  'S13|aller': 'Collège F. Mitterrand',
  'S13|retour': 'Monument de Boiry-St-Martin',
  'S14|aller': 'Collège F. Mitterrand',
  'S14|retour': 'Mairie de Boyelles',
  'S15|aller': 'Collège Verlaine',
  'S15|retour': 'La Targette',
  'S16|aller': 'Collège Peguy',
  'S16|retour': 'Rue de la Liberté',
  'S17|aller': 'Collège Peguy',
  'S17|retour': 'Pont du Gy Etrun',
  'S18|aller': 'Collège Diderot',
  'S18|retour': 'Pont du Gy Etrun',
  'S19|aller': 'Collège Louez Dieu',
  'S19|retour': 'Rue de la Liberté',
  'S2|aller': 'Collège Diderot',
  'S2|retour': 'Pl. de Wagnonlieu',
  'S20|aller': 'Lycée Guy Mollet',
  'S20|retour': 'Rue de la Liberté',
  'S21|aller': 'Lycée Guy Mollet',
  'S21|retour': 'Pont du Gy Etrun',
  'S22|1': 'Ecole Mercatel',
  'S23|1': 'Bray Chemin des Douze',
  'S24|1': 'Ecole d\'Ecurie',
  'S25|1': 'Collège Diderot',
  'S25|2': 'Mairie de Dainville',
  'S26|1': 'Collège Verlaine',
  'S26|2': 'Goudemand',
  'S27|aller': 'Lycée Savary-Jules Ferry',
  'S3|aller': 'Collège Diderot',
  'S3|retour': 'Les Saules',
  'S4|aller': 'Collège Louez Dieu',
  'S4|retour': 'Robespierre',
  'S5|aller': 'Collège Louez Dieu',
  'S6|aller': 'Collège Peguy',
  'S6|retour': 'Filatiers',
  'S7|aller': 'Collège F. Mitterrand',
  'S7|retour': 'Monument de Beaurains',
  'S8|aller': 'Collège Louez Dieu',
  'S8|retour': 'La Targette',
  'S9|aller': 'Emile Breton',
  'S9|retour': 'Salle des Fêtes',
};

/**
 * Résout le terminus réel et lisible pour une direction donnée.
 */
export function resolveDestinationTitle(
  routeShortName: string,
  rawDisplay?: string,
  nextStops?: string[]
): string {
  const sName = (routeShortName || '').trim().toUpperCase();
  const raw = (rawDisplay || '').trim();
  if (!raw) return sName ? `Ligne ${sName}` : 'Direction';

  const key = `${sName}|${raw.toLowerCase()}`;
  if (STATIC_DIRECTIONS_MAP[key]) {
    return STATIC_DIRECTIONS_MAP[key];
  }

  // Traitement si la chaîne contient "Aller, Retour" ou similaire
  if (/aller[,\s/]+retour/i.test(raw)) {
    if (nextStops && nextStops.length > 0) {
      return nextStops[nextStops.length - 1];
    }
    if (STATIC_DIRECTIONS_MAP[`${sName}|aller`]) {
      return STATIC_DIRECTIONS_MAP[`${sName}|aller`];
    }
  }

  const isGeneric = /^(aller|retour|\d+)$/i.test(raw);
  if (isGeneric) {
    if (STATIC_DIRECTIONS_MAP[key]) {
      return STATIC_DIRECTIONS_MAP[key];
    }
    if (nextStops && nextStops.length > 0) {
      return nextStops[nextStops.length - 1];
    }
    if (sName === 'CIT1') return 'Boucle Centre-Ville / Aquarena';
    if (sName === 'CIT2') return 'Boucle Centre-Ville / Citadelle';
    if (sName === 'CIT3') return 'Parking Relais Huileries ↔ Gare';
    return `Direction ${raw}`;
  }

  // Nettoyer les préfixes redondants (ex: "2 Arras centre commercial" -> "Arras Centre Commercial")
  let clean = raw.replace(new RegExp(`^${sName}\\s+`, 'i'), '').trim();
  clean = clean.replace(/^(aller|retour)\s+/i, '').trim();

  // Harmonisation de casse pour les terminus majeurs d'Arras
  const lower = clean.toLowerCase();
  if (lower.includes('arras centre commercial')) return 'Arras Centre Commercial';
  if (lower.includes('st nicolas cruppes') || lower.includes('st-nicolas cruppes')) return 'St-Nicolas Cruppes';
  if (lower.includes('dainville mairie')) return 'Dainville Mairie';
  if (lower.includes('beaurains centre commercial')) return 'Beaurains Centre Commercial';
  if (lower.includes('arras gare')) return 'Arras Gare';

  return clean || `Ligne ${sName}`;
}

/**
 * Télécharge le dump complet des lignes et grilles horaires depuis l'API Artis.
 */
export async function downloadApiDump(force = false): Promise<boolean> {
  try {
    if (!force) {
      const meta = await getApiDumpMeta();
      if (meta && Date.now() - meta.timestamp < DUMP_CACHE_MAX_AGE_MS) {
        return true;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${ARTIS_API_BASE}/infrastructure/client-front/lines`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Erreur HTTP lines dump: ${res.status}`);
    }

    const jsonText = await res.text();
    const parsed: RawApiLine[] = JSON.parse(jsonText);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Données lines invalides ou vides');
    }

    // Sauvegarder sur le système de fichiers
    await FileSystem.writeAsStringAsync(DUMP_FILE, jsonText);

    const meta: ApiDumpMetadata = {
      timestamp: Date.now(),
      linesCount: parsed.length,
      version: '2026/2027',
    };
    await FileSystem.writeAsStringAsync(META_FILE, JSON.stringify(meta));

    inMemoryLines = parsed;
    inMemoryRoutes = null; // Invalider le cache des routes transformées
    return true;
  } catch (err) {
    console.warn('[ApiDump] Échec du téléchargement du dump des lignes:', err);
    return false;
  }
}

/**
 * Récupère les métadonnées du dump local.
 */
export async function getApiDumpMeta(): Promise<ApiDumpMetadata | null> {
  try {
    const info = await FileSystem.getInfoAsync(META_FILE);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(META_FILE);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Charge les données brutes du dump depuis la mémoire ou le disque.
 */
export async function loadApiDump(): Promise<RawApiLine[] | null> {
  if (inMemoryLines && inMemoryLines.length > 0) {
    return inMemoryLines;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(DUMP_FILE);
    if (!fileInfo.exists) {
      // Tenter de télécharger si absent
      const ok = await downloadApiDump(true);
      if (!ok) return null;
    }

    const content = await FileSystem.readAsStringAsync(DUMP_FILE);
    const parsed: RawApiLine[] = JSON.parse(content);
    if (Array.isArray(parsed)) {
      inMemoryLines = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn('[ApiDump] Erreur de lecture du dump des lignes:', err);
  }

  return null;
}

/**
 * Renvoie la liste consolidée des 53 lignes du réseau à partir du dump API.
 */
export async function getApiRoutes(categoryFilter?: RouteCategory | 'all'): Promise<Route[]> {
  if (inMemoryRoutes && inMemoryRoutes.length > 0) {
    if (!categoryFilter || categoryFilter === 'all') return inMemoryRoutes;
    return inMemoryRoutes.filter((r) => r.category === categoryFilter);
  }

  const lines = await loadApiDump();
  if (!lines || lines.length === 0) return [];

  const grouped = new Map<
    string,
    {
      shortName: string;
      destinations: string[];
      endpoints: { first: string; last: string }[];
      minId: number;
    }
  >();

  for (const item of lines) {
    const parts = item.line.split('|');
    const shortName = parts[0].trim();
    const rawDest = parts[1] ? parts[1].trim() : item.line.trim();

    if (!grouped.has(shortName)) {
      grouped.set(shortName, {
        shortName,
        destinations: [],
        endpoints: [],
        minId: item.id,
      });
    }
    const g = grouped.get(shortName)!;

    // Filtrer les libellés purement opérationnels comme "Aller", "Retour", "1", "2"
    const isGeneric = /^(aller|retour|\d+)$/i.test(rawDest);
    if (!isGeneric) {
      const cleanDest = rawDest.replace(new RegExp(`^${shortName}\\s+`, 'i'), '').trim();
      if (cleanDest && !g.destinations.includes(cleanDest)) {
        g.destinations.push(cleanDest);
      }
    }

    if (item.stops && item.stops.length > 0) {
      const first = item.stops[0].name?.trim();
      const last = item.stops[item.stops.length - 1].name?.trim();
      if (first && last) {
        g.endpoints.push({ first, last });
      }
    }

    g.minId = Math.min(g.minId, item.id);
  }

  const routes: Route[] = Array.from(grouped.values()).map((g, idx) => {
    const category = determineRouteCategory(g.shortName);
    const colorScheme =
      ROUTE_COLORS[g.shortName] ||
      (category === 'scolaire'
        ? { bg: '#408080', text: '#FFFFFF' }
        : category === 'urbaine'
        ? { bg: '#4EB9EA', text: '#FFFFFF' }
        : category === 'periurbaine'
        ? { bg: '#FF8000', text: '#FFFFFF' }
        : { bg: '#F58220', text: '#FFFFFF' });

    // Calcul du titre humain
    let longName = KNOWN_ROUTE_TITLES[g.shortName];
    if (!longName) {
      if (g.destinations.length > 0) {
        longName = g.destinations.join(' ↔ ');
      } else if (g.endpoints.length > 0) {
        // Déduire les terminus à partir des extrémités de parcours
        const endpointSet = new Set<string>();
        for (const ep of g.endpoints) {
          if (ep.first) endpointSet.add(ep.first);
          if (ep.last) endpointSet.add(ep.last);
        }
        const arr = Array.from(endpointSet);
        if (arr.length === 2) {
          longName = `${arr[0]} ↔ ${arr[1]}`;
        } else if (arr.length > 2) {
          longName = `${g.endpoints[0].first} ↔ ${g.endpoints[0].last}`;
        } else {
          longName = arr[0] || `Ligne ${g.shortName}`;
        }
      } else {
        longName = `Ligne ${g.shortName}`;
      }
    }

    // Calcul de l'ordre de tri
    const num = parseInt(g.shortName, 10);
    let sortOrder = 999;
    if (!isNaN(num)) {
      sortOrder = num; // 1 à 18
    } else if (g.shortName.startsWith('CIT')) {
      const citNum = parseInt(g.shortName.replace('CIT', ''), 10) || 0;
      sortOrder = 100 + citNum;
    } else if (category === 'navette') {
      sortOrder = 150 + idx;
    } else if (g.shortName.startsWith('S')) {
      const sNum = parseInt(g.shortName.replace('S', ''), 10) || 0;
      sortOrder = 200 + sNum;
    } else if (g.shortName.startsWith('D')) {
      const dNum = parseInt(g.shortName.replace('D', ''), 10) || 0;
      sortOrder = 300 + dNum;
    } else {
      sortOrder = 400 + idx;
    }

    return {
      route_id: g.shortName,
      agency_id: 'ARTIS',
      route_short_name: g.shortName,
      route_long_name: longName,
      route_type: 3,
      route_color: formatHexColor(colorScheme.bg, '#134785'),
      route_text_color: formatHexColor(colorScheme.text, '#FFFFFF'),
      route_sort_order: sortOrder,
      category,
    };
  });

  // Tri logique (1, 2, 3... 18, CIT1, CIT2, CIT3, ACTI, S1, S2...)
  routes.sort((a, b) => a.route_sort_order - b.route_sort_order);
  inMemoryRoutes = routes;

  if (!categoryFilter || categoryFilter === 'all') {
    return routes;
  }
  return routes.filter((r) => r.category === categoryFilter);
}

/**
 * Renvoie les directions et arrêts ordonnés pour une ligne donnée à partir du dump API.
 */
export async function getApiRouteDirections(routeShortName: string): Promise<RouteDirection[]> {
  const lines = await loadApiDump();
  if (!lines) return [];

  // Trouver tous les enregistrements correspondant à ce shortName
  const matching = lines.filter((l) => {
    const sName = l.line.split('|')[0].trim();
    return sName.toLowerCase() === routeShortName.toLowerCase();
  });

  return matching.map((item, dirIdx) => {
    const parts = item.line.split('|');
    const rawDest = parts[1] ? parts[1].trim() : item.line.trim();

    const stops: RouteStop[] = (item.stops || []).map((s) => ({
      stop_id: s.gtfs_stop_id || `${item.id}-${s.sequence}`,
      stop_name: s.name,
      stop_lat: parseFloat(s.latitude) || 0,
      stop_lon: parseFloat(s.longitude) || 0,
      stop_sequence: s.sequence,
    }));

    // Déterminer une destination claire : remplacer "Aller", "Retour", "1", "2" par le terminus réel
    const destination = resolveDestinationTitle(
      routeShortName,
      rawDest,
      stops.map((s) => s.stop_name)
    );

    return {
      direction_id: dirIdx,
      destination: destination || `Direction ${dirIdx + 1}`,
      stops,
    };
  });
}

/**
 * Renvoie la fiche horaire théorique pour un arrêt d'une ligne à partir du dump API.
 */
export async function getApiTimetableForStop(
  stopGtfsId: string,
  routeShortName: string,
  directionIdx: number = 0,
  targetDate: Date = new Date()
): Promise<TimetableSlot[]> {
  const lines = await loadApiDump();
  if (!lines) return [];

  const matching = lines.filter((l) => {
    const sName = l.line.split('|')[0].trim();
    return sName.toLowerCase() === routeShortName.toLowerCase();
  });

  const selectedLine = matching[directionIdx] || matching[0];
  if (!selectedLine || !Array.isArray(selectedLine.stops)) return [];

  const targetStop = selectedLine.stops.find(
    (s) => s.gtfs_stop_id === stopGtfsId || s.name.toLowerCase().includes(stopGtfsId.toLowerCase())
  );
  if (!targetStop || !Array.isArray(targetStop.schedules) || targetStop.schedules.length === 0) {
    return [];
  }

  // Déterminer le jour de la semaine en français
  const daysFr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const currentDayName = daysFr[targetDate.getDay()];

  // Chercher la période de service correspondant au jour
  let matchedSchedule = targetStop.schedules.find((sc) =>
    sc.service_period.toLowerCase().includes(currentDayName)
  );

  // Fallback vers le premier schedule disponible si pas de correspondance stricte
  if (!matchedSchedule) {
    matchedSchedule = targetStop.schedules[0];
  }

  if (!matchedSchedule || !Array.isArray(matchedSchedule.departures)) {
    return [];
  }

  const rawDest = selectedLine.line.split('|')[1]?.trim() || selectedLine.line.trim();
  const dest = resolveDestinationTitle(
    routeShortName,
    rawDest,
    selectedLine.stops.map((s) => s.name)
  );

  return matchedSchedule.departures.map((timeStr, idx) => ({
    departure_time: timeStr.substring(0, 5),
    trip_headsign: dest || `Ligne ${routeShortName}`,
    trip_id: `api-${selectedLine.id}-${idx}`,
  }));
}
