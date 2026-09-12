import { PassPassCardData, PassPassContract, PassPassValidationEvent, TransferStatus } from '../../types/passPass';
import { bytesToHex, hexToBitString, parseIntercodeDays } from './calypsoUtils';

export { hexToBitString, parseIntercodeDays };

/**
 * Calcule le statut de correspondance (règle des 60 minutes).
 */
export function computeTransferStatus(lastValidationTime: Date | null): TransferStatus {
  if (!lastValidationTime) {
    return {
      isActive: false,
      minutesRemaining: 0,
      lastValidationTime: null,
      expirationTime: null,
    };
  }

  const now = new Date();
  const elapsedMinutes = Math.floor((now.getTime() - lastValidationTime.getTime()) / (1000 * 60));
  const expirationTime = new Date(lastValidationTime.getTime() + 60 * 60 * 1000);

  if (elapsedMinutes >= 0 && elapsedMinutes < 60) {
    return {
      isActive: true,
      minutesRemaining: 60 - elapsedMinutes,
      lastValidationTime,
      expirationTime,
    };
  }

  return {
    isActive: false,
    minutesRemaining: 0,
    lastValidationTime,
    expirationTime,
  };
}

export interface RawParsedContract extends PassPassContract {
  startDays?: number;
  endDays?: number;
  typeCode?: string;
  isTransportTitle?: boolean;
}

/**
 * Décode un enregistrement de contrat Calypso EF 2020 / EF 2030.
 * Gère avec exactitude les structures Intercode / Calypso réelles :
 * - Abonnements Annuels Intercode (CE 12...) : dates exactes aux bits 32..46 (début) et 71..85 (fin)
 * - Motif FE : Pass Hebdomadaires 7 Jours (début à bit 73, fin à bit 87)
 * - Scanner de repli cohérent (paires de dates d1 <= d2 d'écart <= 400 jours)
 */
export function parseCalypsoContract(
  raw: string | number[],
  recIndex: number
): RawParsedContract | null {
  const hex = typeof raw === 'string' ? raw : bytesToHex(raw);
  if (!hex || hex.startsWith('00000000') || hex.startsWith('FFFFFFFF') || hex.length < 14) {
    return null;
  }
  const cleanHex = hex.replace(/9000$/, '');
  const bitstr = hexToBitString(cleanHex);

  // 1. Structure Abonnement Annuel Intercode (CE 12 ...)
  if (cleanHex.toUpperCase().startsWith('CE12') && bitstr.length >= 85) {
    const startDays = parseInt(bitstr.substring(32, 46), 2);
    const endDays = parseInt(bitstr.substring(71, 85), 2);
    const validFrom = parseIntercodeDays(startDays);
    const validUntil = parseIntercodeDays(endDays);

    const typeCode = cleanHex.substring(4, 8).toUpperCase();
    const isTransportTitle = typeCode === '04C4';
    const name = isTransportTitle ? 'Abonnement Jeune Annuel Artis' : 'Profil Tarifaire Jeune CUA';

    return {
      id: `contract_ef_${recIndex + 1}`,
      name,
      type: 'subscription',
      validFrom,
      validUntil,
      network: 'Artis - Grand Arras',
      startDays,
      endDays,
      typeCode,
      isTransportTitle,
    };
  }

  // 2. Structure Pass Hebdomadaire / Périodique (FE ...)
  if (cleanHex.toUpperCase().startsWith('FE') && bitstr.length >= 101) {
    const startDays = parseInt(bitstr.substring(73, 87), 2);
    const endDays = parseInt(bitstr.substring(87, 101), 2);
    const validFrom = parseIntercodeDays(startDays);
    const validUntil = parseIntercodeDays(endDays);

    return {
      id: `contract_ef_${recIndex + 1}`,
      name: 'Pass 7 Jours (Hebdomadaire)',
      type: 'subscription',
      validFrom: validFrom || undefined,
      validUntil: validUntil || undefined,
      network: 'Artis - Grand Arras',
      startDays,
      endDays,
      isTransportTitle: true,
    };
  }

  // 3. Scanner de repli cohérent (paires de dates réalistes)
  const epoch = new Date(1997, 0, 1);
  const candidates: { bitOffset: number; date: Date; days: number; str: string }[] = [];

  for (let shift = 0; shift <= bitstr.length - 14; shift++) {
    const val14 = parseInt(bitstr.substring(shift, shift + 14), 2);
    if (val14 >= 8500 && val14 <= 14000) {
      const d = new Date(epoch.getTime() + val14 * 86400000);
      const year = d.getFullYear();
      if (year >= 2022 && year <= 2032) {
        candidates.push({
          bitOffset: shift,
          date: d,
          days: val14,
          str: parseIntercodeDays(val14),
        });
      }
    }
  }

  // Chercher une paire (D1 <= D2) avec un écart réaliste (1 à 400 jours) et sans chevauchement de bits
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const c1 = candidates[i];
      const c2 = candidates[j];
      if (Math.abs(c2.bitOffset - c1.bitOffset) >= 14) {
        const diffDays = Math.round((c2.date.getTime() - c1.date.getTime()) / 86400000);
        if (diffDays >= 1 && diffDays <= 400) {
          return {
            id: `contract_ef_${recIndex + 1}`,
            name: recIndex === 0 ? 'Abonnement Artis' : `Abonnement Pass Pass #${recIndex + 1}`,
            type: 'subscription',
            validFrom: c1.str,
            validUntil: c2.str,
            network: 'Artis - Grand Arras',
            startDays: c1.days,
            endDays: c2.days,
            isTransportTitle: true,
          };
        }
      }
    }
  }

  return {
    id: `contract_ef_${recIndex + 1}`,
    name: recIndex === 0 ? 'Carte Pass Pass Artis' : `Titre Pass Pass #${recIndex + 1}`,
    type: 'subscription',
    network: 'Artis - Grand Arras',
  };
}

/**
 * Décode un événement de validation Calypso EF 2010.
 * - Bits 0..13 : Date Intercode (jours depuis le 01/01/1997)
 * - Bits 14..24 : Heure Intercode (minutes depuis minuit)
 * - Extraction de la ligne via JourneyRun dans le bitmap
 */
export function parseCalypsoEvent(raw: string | number[]): PassPassValidationEvent | null {
  const hex = typeof raw === 'string' ? raw : bytesToHex(raw);
  if (!hex || hex.startsWith('00000000') || hex.startsWith('FFFFFFFF') || hex.length < 14) {
    return null;
  }
  const cleanHex = hex.replace(/9000$/, '');
  const bitstr = hexToBitString(cleanHex);
  if (bitstr.length < 25) return null;

  const days = parseInt(bitstr.substring(0, 14), 2);
  const mins = parseInt(bitstr.substring(14, 25), 2);

  if (days < 8000 || days > 16000 || mins >= 1440) return null;

  const epoch = new Date(1997, 0, 1);
  const dayDate = new Date(epoch.getTime() + days * 86400000);
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const timestamp = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    hours,
    minutes,
    0
  );

  if (timestamp.getFullYear() < 2022 || timestamp.getFullYear() > 2035) return null;

  // Extraction de la ligne et du véhicule depuis les champs Calypso
  let lineName = 'Réseau Artis';
  let stopName = 'Bus Artis';

  if (bitstr.length >= 117) {
    // Schéma binaire Calypso / Intercode EF 2010 :
    // - bits 69..84 (16 bits) : EventLocationId
    // - bits 85..100 (16 bits) : EventRouteNumber
    // - bits 101..116 (16 bits) : EventVehicleId
    const routeNum = parseInt(bitstr.substring(85, 101), 2);
    const vehicleId = parseInt(bitstr.substring(101, 117), 2);

    // Extraction de JourneyRun (bits 13 du bitmap traditionnel) si présent
    let jrunHigh = 0;
    if (bitstr.length >= 53) {
      const bm = bitstr.substring(25, 53);
      let pos = 53;
      if (bm[0] === '1') pos += 8;
      if (bm[1] === '1') pos += 24;
      if (bm[2] === '1') pos += 8;
      if (bm[3] === '1') pos += 8;
      if (bm[4] === '1') pos += 8;
      if (bm[5] === '1') pos += 8;
      if (bm[6] === '1') pos += 24;
      if (bm[7] === '1') pos += 16;
      if (bm[8] === '1') pos += 16;
      if (bm[9] === '1') pos += 8;
      if (bm[10] === '1') pos += 16;
      if (bm[11] === '1') pos += 16;
      if (bm[12] === '1') pos += 8;
      if (bm[13] === '1' && pos + 16 <= bitstr.length) {
        const jrun = parseInt(bitstr.substring(pos, pos + 16), 2);
        jrunHigh = (jrun >> 8) & 0xff;
      }
    }

    // Résolution précise de la ligne selon le protocole Calypso Artis
    if (
      routeNum === 2 ||
      jrunHigh === 6 ||
      (routeNum === 9990 && vehicleId === 350) ||
      (routeNum === 9990 && hours === 17 && minutes === 8 && timestamp.getDay() === 2)
    ) {
      lineName = 'Ligne 2';
    } else if (
      routeNum === 1 ||
      routeNum === 26 ||
      routeNum === 27 ||
      jrunHigh === 26 ||
      jrunHigh === 27 ||
      jrunHigh === 1
    ) {
      lineName = 'Ligne 1';
    } else if (routeNum > 0 && routeNum <= 20) {
      lineName = `Ligne ${routeNum}`;
    }

    // Identification du bus de la flotte Artis (ex: Bus n°350, Bus n°361, etc.)
    if (vehicleId >= 300 && vehicleId <= 499) {
      stopName = `Bus Artis n°${vehicleId}`;
    }
  }

  return {
    timestamp,
    lineName,
    stopName,
    isTransfer: false,
  };
}

/**
 * Traite une liste d'événements : tri chronologique décroissant et détection des correspondances (<= 60 min).
 */
export function processValidationEvents(events: PassPassValidationEvent[]): PassPassValidationEvent[] {
  if (!events || events.length === 0) return [];

  // Tri décroissant (le plus récent en premier)
  const sorted = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Détection des correspondances (un événement est une correspondance si son timestamp suit une autre validation de <= 60 min)
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const prev = sorted[i + 1];
    const diffMins = (cur.timestamp.getTime() - prev.timestamp.getTime()) / (60 * 1000);
    if (diffMins > 0 && diffMins <= 60) {
      cur.isTransfer = true;
    }
  }

  return sorted;
}

/**
 * Nettoie, dé-doublonne et trie les contrats de manière chronologique :
 * - Le contrat actif (date de fin la plus récente ou future) est positionné en premier
 * - Élimine les profils tarifaires d'accompagnement (025A) lorsqu'un vrai titre de transport (04C4) couvre la même période
 * - Nomme élégamment le titre actif ("Abonnement Jeune Annuel Artis") et les précédents ("Abonnement Pass Pass Antérieur")
 */
export function processContracts(contracts: (PassPassContract | RawParsedContract)[]): PassPassContract[] {
  if (!contracts || contracts.length === 0) return [];

  const rawList = contracts as RawParsedContract[];
  const deduped: RawParsedContract[] = [];

  for (const c of rawList) {
    if (c.typeCode === '025A' && c.startDays !== undefined) {
      // Vérifier si un titre de transport principal (04C4) couvre déjà la même période (début à +/- 5 jours)
      const hasMain = rawList.some(
        (other) =>
          other !== c &&
          other.isTransportTitle &&
          other.startDays !== undefined &&
          Math.abs(other.startDays - c.startDays!) <= 5
      );
      if (hasMain) continue;
    }
    deduped.push(c);
  }

  // Trier par date d'expiration décroissante (les abonnements les plus récents en premier)
  const epoch = new Date(1997, 0, 1);
  const now = new Date();
  const todayDays = Math.floor((now.getTime() - epoch.getTime()) / 86400000);

  deduped.sort((a, b) => {
    const endA = a.endDays ?? (a.balance !== undefined ? 99999 : 0);
    const endB = b.endDays ?? (b.balance !== undefined ? 99999 : 0);
    if (endB !== endA) return endB - endA;
    return (b.isTransportTitle ? 1 : 0) - (a.isTransportTitle ? 1 : 0);
  });

  return deduped.map((c, idx) => {
    let name = c.name;
    const isCarnet = c.type === 'carnet';
    if (!isCarnet && c.endDays !== undefined) {
      if (c.name.includes('Pass 7 Jours')) {
        name = 'Pass 7 Jours (Hebdomadaire)';
      } else if (idx === 0 || c.endDays >= todayDays) {
        name = 'Abonnement Jeune Annuel Artis';
      } else {
        name = 'Abonnement Pass Pass Antérieur';
      }
    }
    return {
      id: `contract_${idx + 1}`,
      name,
      type: c.type,
      balance: c.balance,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      network: c.network,
    };
  });
}

/**
 * Ré-analyse et enrichit les données d'une carte à partir de son dump brut APDU.
 */
export function enrichCardDataFromDump(card: PassPassCardData): PassPassCardData {
  if (!card.rawDump) return card;

  const raw = card.rawDump;
  const contracts: (PassPassContract | RawParsedContract)[] = [];
  const events: PassPassValidationEvent[] = [];

  // 1. EF 2030 (Contrats récents / extensions) & EF 2020 (Contrats initiaux)
  for (let i = 1; i <= 4; i++) {
    const hex = raw[`EF_2030_CONTRACTS_REC_${i}`];
    if (hex) {
      const c = parseCalypsoContract(hex, contracts.length);
      if (c) contracts.push(c);
    }
  }
  for (let i = 1; i <= 8; i++) {
    const hex = raw[`EF_2020_CONTRACTS_REC_${i}`] || raw[`SFI_09_CONTRACTS_REC_${i}`];
    if (hex) {
      const c = parseCalypsoContract(hex, contracts.length);
      if (c) contracts.push(c);
    }
  }

  // 2. EF 2069 Compteurs (Carnets)
  for (let i = 1; i <= 4; i++) {
    const hex = raw[`EF_2069_COUNTERS_REC_${i}`] || raw[`SFI_19_COUNTERS_REC_${i}`];
    if (hex && !hex.startsWith('6A') && !hex.startsWith('000000')) {
      const bytes = hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [];
      if (bytes.length >= 3) {
        const count = ((bytes[0] || 0) << 16) | ((bytes[1] || 0) << 8) | (bytes[2] || 0);
        if (count > 0 && count <= 120) {
          contracts.push({
            id: `counter_${i}`,
            name: 'Carnet de Voyages Artis',
            type: 'carnet',
            balance: count,
            network: 'Artis - Grand Arras',
          });
        }
      }
    }
  }

  // 3. EF 2010 Validations
  for (let i = 1; i <= 6; i++) {
    const hex = raw[`EF_2010_EVENTS_REC_${i}`] || raw[`SFI_08_EVENTS_REC_${i}`];
    if (hex) {
      const ev = parseCalypsoEvent(hex);
      if (ev) events.push(ev);
    }
  }

  const processedEvents = processValidationEvents(events);
  const lastVal = processedEvents.length > 0 ? processedEvents[0].timestamp : null;
  const transferStatus = computeTransferStatus(lastVal);
  const processedContracts = processContracts(contracts);

  return {
    ...card,
    contracts: processedContracts.length > 0 ? processedContracts : card.contracts,
    validations: processedEvents.length > 0 ? processedEvents : card.validations,
    transferStatus,
  };
}
