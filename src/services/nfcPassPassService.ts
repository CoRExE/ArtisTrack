import { NativeModules } from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { PassPassCardData, PassPassContract, PassPassValidationEvent } from '../types/passPass';
import { sendApdu, formatCardId, bytesToHex, ApduResult } from './passpass/calypsoApdu';
import {
  parseCalypsoContract,
  parseCalypsoEvent,
  processValidationEvents,
  computeTransferStatus,
  enrichCardDataFromDump,
  parseIntercodeDays,
  hexToBitString,
  processContracts,
} from './passpass/calypsoDecoder';
import {
  saveCardToStorage,
  loadCardFromStorage,
  clearSavedCard,
  STORAGE_KEY_CARD,
} from './passpass/passPassStorage';
import { getDemoCardData } from './passpass/passPassDemo';

// Re-exports transparents pour compatibilité totale avec les consommateurs existants
export {
  bytesToHex,
  formatCardId,
  hexToBitString,
  parseIntercodeDays,
  parseCalypsoContract,
  parseCalypsoEvent,
  processValidationEvents,
  computeTransferStatus,
  enrichCardDataFromDump,
  processContracts,
  saveCardToStorage,
  loadCardFromStorage,
  clearSavedCard,
  getDemoCardData,
  STORAGE_KEY_CARD,
};
export type { ApduResult };

/**
 * Vérifie si le module natif NFC est compilé et accessible (faux dans Expo Go).
 */
export function isNativeNfcAvailable(): boolean {
  return !!NativeModules?.NfcManager;
}

/**
 * Initialise le gestionnaire NFC.
 */
export async function initNfc(): Promise<boolean> {
  if (!isNativeNfcAvailable()) {
    return false;
  }
  try {
    const supported = await NfcManager.isSupported();
    if (supported) {
      await NfcManager.start();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Lit une carte physique Pass Pass via ISO-DEP et décode ses contrats & passages Calypso.
 */
export async function scanPassPassCard(): Promise<PassPassCardData> {
  if (!isNativeNfcAvailable()) {
    throw new Error('EXPO_GO_OR_NO_NATIVE_NFC');
  }

  const rawDump: Record<string, string> = {};

  try {
    await NfcManager.requestTechnology(NfcTech.IsoDep, {
      alertMessage: 'Approchez votre carte Pass Pass du haut de votre téléphone',
    });

    try {
      if ((NfcManager as any).setTimeout) {
        await (NfcManager as any).setTimeout(3000);
      }
    } catch {
      // Ignore si non supporté
    }

    const tag = await NfcManager.getTag();
    const rawCardId = tag?.id || 'PASS-PASS-NFC';
    rawDump.TAG_ID = rawCardId;
    if ((tag as any)?.techTypes) {
      rawDump.TECH_TYPES = Array.isArray((tag as any).techTypes)
        ? (tag as any).techTypes.join(', ')
        : String((tag as any).techTypes);
    }

    // =========================================================================
    // ÉTAPE 1 : Sélection de l'Application Calypso par son AID exact (11 octets)
    // AID CNA / Artis : A0 00 00 02 91 A0 00 00 01 91 02
    // =========================================================================
    const exactAidCmd = [
      0x00, 0xa4, 0x04, 0x00, 0x0b, 0xa0, 0x00, 0x00, 0x02, 0x91, 0xa0, 0x00, 0x00, 0x01, 0x91, 0x02,
    ];
    const aidRes = await sendApdu(exactAidCmd);
    rawDump.SELECT_AID_EXACT = aidRes.rawHex;

    if (aidRes.rawHex.includes('C708')) {
      const idx = aidRes.rawHex.indexOf('C708');
      const serialHex = aidRes.rawHex.substring(idx + 4, idx + 4 + 16);
      rawDump.CALYPSO_SERIAL = serialHex;
    }

    // =========================================================================
    // ÉTAPE 2 : Sélection du DF 2000 (Répertoire Billetterie Artis "AAA")
    // =========================================================================
    const df2000Res = await sendApdu([0x00, 0xa4, 0x00, 0x00, 0x02, 0x20, 0x00]);
    rawDump.SELECT_DF_2000 = df2000Res.rawHex;

    const ensureDf2000 = async () => {
      await sendApdu([0x00, 0xa4, 0x00, 0x00, 0x02, 0x20, 0x00]);
    };

    const contracts: PassPassContract[] = [];
    const validations: PassPassValidationEvent[] = [];

    // Helper pour sélectionner un EF puis lire ses enregistrements
    const selectAndReadEf = async (
      efIdBytes: [number, number],
      efName: string,
      maxRecords: number,
      recordLength: number = 0x1d
    ): Promise<string[]> => {
      await ensureDf2000();

      let selRes = await sendApdu([0x00, 0xa4, 0x02, 0x00, 0x02, efIdBytes[0], efIdBytes[1]]);
      if (!selRes.ok) {
        selRes = await sendApdu([0x00, 0xa4, 0x00, 0x00, 0x02, efIdBytes[0], efIdBytes[1]]);
      }
      if (!selRes.ok) {
        selRes = await sendApdu([0x94, 0xa4, 0x02, 0x00, 0x02, efIdBytes[0], efIdBytes[1]]);
      }

      rawDump[`SEL_${efName}`] = selRes.rawHex;
      const recordsData: string[] = [];

      if (selRes.ok) {
        for (let rec = 1; rec <= maxRecords; rec++) {
          let readRes = await sendApdu([0x00, 0xb2, rec, 0x04, recordLength]);
          if (!readRes.ok && readRes.sw === '6E00') {
            readRes = await sendApdu([0x94, 0xb2, rec, 0x04, recordLength]);
          }
          if (!readRes.ok && readRes.data.length === 0) {
            readRes = await sendApdu([0x00, 0xb2, rec, 0x04, 0x00]);
          }

          if (readRes.data.length > 0 || readRes.ok) {
            rawDump[`${efName}_REC_${rec}`] = readRes.rawHex;
            recordsData.push(readRes.rawHex);
          } else if (readRes.sw && readRes.sw !== 'ERR') {
            rawDump[`${efName}_REC_${rec}_SW`] = readRes.sw;
          }
        }

        if (recordsData.length === 0) {
          const binRes = await sendApdu([0x00, 0xb0, 0x00, 0x00, recordLength]);
          if (binRes.ok && binRes.data.length > 0) {
            rawDump[`${efName}_BIN`] = binRes.rawHex;
            recordsData.push(binRes.rawHex);
          }
        }
      }

      return recordsData;
    };

    // =========================================================================
    // ÉTAPE 3 : Lecture des fichiers élémentaires Calypso sous DF 2000
    // =========================================================================

    // A. EF 2001 - Environnement & Carte
    await selectAndReadEf([0x20, 0x01], 'EF_2001_ENV', 2, 0x1d);

    // B. EF 2020 - Contrats / Abonnements
    const contractsHexList = await selectAndReadEf([0x20, 0x20], 'EF_2020_CONTRACTS', 8, 0x1d);
    contractsHexList.forEach((hex) => {
      const c = parseCalypsoContract(hex, contracts.length);
      if (c) contracts.push(c);
    });

    // B2. EF 2030 - Extension Contrats Calypso (si présente)
    const contracts2HexList = await selectAndReadEf([0x20, 0x30], 'EF_2030_CONTRACTS', 4, 0x1d);
    contracts2HexList.forEach((hex) => {
      const c = parseCalypsoContract(hex, contracts.length);
      if (c) contracts.push(c);
    });

    // C. EF 2010 - Validations / Derniers passages
    const eventsHexList = await selectAndReadEf([0x20, 0x10], 'EF_2010_EVENTS', 6, 0x1d);
    eventsHexList.forEach((hex) => {
      const ev = parseCalypsoEvent(hex);
      if (ev) validations.push(ev);
    });

    // D. EF 2069 - Compteurs de voyages (Carnets)
    const countersHexList = await selectAndReadEf([0x20, 0x69], 'EF_2069_COUNTERS', 4, 0x03);
    countersHexList.forEach((hex, idx) => {
      const bytes = hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [];
      if (bytes.length >= 3) {
        const counterVal = ((bytes[0] || 0) << 16) | ((bytes[1] || 0) << 8) | (bytes[2] || 0);
        if (counterVal > 0 && counterVal <= 120) {
          contracts.push({
            id: `counter_ef_${idx + 1}`,
            name: 'Carnet de Voyages Artis',
            type: 'carnet',
            balance: counterVal,
            network: 'Artis - Grand Arras',
          });
        }
      }
    });

    // E. EF 2040 (Spécial) & EF 2050 (Liste contrats)
    await selectAndReadEf([0x20, 0x40], 'EF_2040_SPECIAL', 2, 0x1d);
    await selectAndReadEf([0x20, 0x50], 'EF_2050_LIST', 1, 0x1d);

    // =========================================================================
    // ÉTAPE 4 : Exploration par SFI direct sous DF 2000 (Fallback cartes hybrides)
    // =========================================================================
    if (contracts.length === 0 && validations.length === 0) {
      await ensureDf2000();

      const sfis = [
        { sfi: 0x07, name: 'SFI_07_ENV', count: 2, len: 0x1d },
        { sfi: 0x09, name: 'SFI_09_CONTRACTS', count: 4, len: 0x1d },
        { sfi: 0x08, name: 'SFI_08_EVENTS', count: 4, len: 0x1d },
        { sfi: 0x19, name: 'SFI_19_COUNTERS', count: 3, len: 0x03 },
        { sfi: 0x1d, name: 'SFI_1D_SPECIAL', count: 2, len: 0x1d },
      ];

      for (const { sfi, name, count, len } of sfis) {
        for (let rec = 1; rec <= count; rec++) {
          const p2 = (sfi << 3) | 0x04;
          let res = await sendApdu([0x00, 0xb2, rec, p2, len]);
          if (!res.ok && res.sw === '6E00') {
            res = await sendApdu([0x94, 0xb2, rec, p2, len]);
          }

          if (res.data.length > 0 || res.ok) {
            rawDump[`${name}_REC_${rec}`] = res.rawHex;

            if (sfi === 0x09 && res.data.length >= 7) {
              const c = parseCalypsoContract(res.data, contracts.length);
              if (c) contracts.push(c);
            }

            if (sfi === 0x08 && res.data.length >= 4) {
              const ev = parseCalypsoEvent(res.data);
              if (ev) validations.push(ev);
            }

            if (sfi === 0x19 && res.data.length >= 3) {
              const counterVal = ((res.data[0] || 0) << 16) | ((res.data[1] || 0) << 8) | (res.data[2] || 0);
              if (counterVal > 0 && counterVal <= 120) {
                contracts.push({
                  id: `counter_sfi_${rec}`,
                  name: 'Carnet de Voyages Artis',
                  type: 'carnet',
                  balance: counterVal,
                  network: 'Artis - Grand Arras',
                });
              }
            }
          } else if (res.sw && res.sw !== 'ERR') {
            rawDump[`${name}_REC_${rec}_SW`] = res.sw;
          }
        }
      }
    }

    const processedValidations = processValidationEvents(validations);
    const lastValidation = processedValidations.length > 0 ? processedValidations[0].timestamp : null;
    const transferStatus = computeTransferStatus(lastValidation);
    const processedContracts = processContracts(contracts);

    if (processedContracts.length === 0) {
      processedContracts.push({
        id: '1',
        name: 'Carte Pass Pass Artis',
        type: 'subscription',
        network: 'Artis - Grand Arras',
      });
    }

    const cardData: PassPassCardData = {
      cardId: formatCardId(rawCardId),
      profile: 'Carte Pass Pass Artis',
      contracts: processedContracts,
      validations: processedValidations,
      transferStatus,
      scannedAt: new Date(),
      rawDump,
    };

    // Sauvegarder automatiquement la carte dans AsyncStorage
    await saveCardToStorage(cardData);

    return cardData;
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignorer
    }
  }
}
