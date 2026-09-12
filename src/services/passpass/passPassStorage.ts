import AsyncStorage from '@react-native-async-storage/async-storage';
import { PassPassCardData } from '../../types/passPass';
import { computeTransferStatus, enrichCardDataFromDump } from './calypsoDecoder';

export const STORAGE_KEY_CARD = '@passpass_saved_card';

/**
 * Sauvegarde la carte scannée en local dans AsyncStorage.
 */
export async function saveCardToStorage(card: PassPassCardData): Promise<void> {
  try {
    const payload = JSON.stringify(card);
    await AsyncStorage.setItem(STORAGE_KEY_CARD, payload);
  } catch (err) {
    console.error('Erreur sauvegarde carte Pass Pass:', err);
  }
}

/**
 * Charge la dernière carte scannée depuis AsyncStorage et ré-enrichit
 * automatiquement ses données avec les derniers décodeurs Calypso.
 */
export async function loadCardFromStorage(): Promise<PassPassCardData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CARD);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PassPassCardData;

    if (parsed.scannedAt) parsed.scannedAt = new Date(parsed.scannedAt);
    if (parsed.transferStatus?.lastValidationTime) {
      parsed.transferStatus.lastValidationTime = new Date(parsed.transferStatus.lastValidationTime);
    }
    if (parsed.transferStatus?.expirationTime) {
      parsed.transferStatus.expirationTime = new Date(parsed.transferStatus.expirationTime);
    }
    if (parsed.validations) {
      parsed.validations = parsed.validations.map((v) => ({
        ...v,
        timestamp: new Date(v.timestamp),
      }));
    }

    parsed.transferStatus = computeTransferStatus(parsed.transferStatus?.lastValidationTime || null);

    return enrichCardDataFromDump(parsed);
  } catch (err) {
    console.error('Erreur chargement carte Pass Pass stockée:', err);
    return null;
  }
}

/**
 * Supprime la carte enregistrée en local.
 */
export async function clearSavedCard(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_CARD);
  } catch (err) {
    console.error('Erreur suppression carte Pass Pass:', err);
  }
}
