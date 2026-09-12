import NfcManager from 'react-native-nfc-manager';
import { bytesToHex, formatCardId } from './calypsoUtils';

export { bytesToHex, formatCardId };

export interface ApduResult {
  ok: boolean;
  sw: string;
  sw1: number;
  sw2: number;
  data: number[];
  dataHex: string;
  rawHex: string;
  error?: string;
}

/**
 * Envoie une commande APDU via ISO-DEP et gère automatiquement :
 * - Le statut d'erreur
 * - Le code 6C xx (Wrong Le : réémission automatique avec la bonne longueur sw2)
 * - Le code 61 xx (Data waiting : émission automatique de GET RESPONSE avec sw2)
 */
export async function sendApdu(cmd: number[]): Promise<ApduResult> {
  try {
    const resp = await NfcManager.isoDepHandler.transceive(cmd);
    if (!resp || resp.length < 2) {
      return {
        ok: false,
        sw: 'EMPTY',
        sw1: 0,
        sw2: 0,
        data: [],
        dataHex: '',
        rawHex: resp ? bytesToHex(resp) : 'EMPTY',
      };
    }

    let sw1 = resp[resp.length - 2];
    let sw2 = resp[resp.length - 1];

    // Cas 6C xx : Longueur Le incorrecte, la carte réclame exactement sw2 octets
    if (sw1 === 0x6c) {
      let retryCmd: number[];
      if (cmd.length === 5) {
        retryCmd = [cmd[0], cmd[1], cmd[2], cmd[3], sw2];
      } else if (cmd.length === 4) {
        retryCmd = [...cmd, sw2];
      } else {
        const lc = cmd[4];
        if (cmd.length === 5 + lc + 1) {
          retryCmd = [...cmd.slice(0, -1), sw2];
        } else {
          retryCmd = [...cmd, sw2];
        }
      }

      try {
        const retryResp = await NfcManager.isoDepHandler.transceive(retryCmd);
        if (retryResp && retryResp.length >= 2) {
          sw1 = retryResp[retryResp.length - 2];
          sw2 = retryResp[retryResp.length - 1];
          const data = retryResp.slice(0, retryResp.length - 2);
          return {
            ok: sw1 === 0x90 && sw2 === 0x00,
            sw: bytesToHex([sw1, sw2]),
            sw1,
            sw2,
            data,
            dataHex: bytesToHex(data),
            rawHex: bytesToHex(retryResp),
          };
        }
      } catch {
        // Ignorer l'erreur du retry
      }
    }

    // Cas 61 xx : Données en attente, exécuter GET RESPONSE
    if (sw1 === 0x61) {
      const getRespCmd = [cmd[0], 0xc0, 0x00, 0x00, sw2];
      try {
        const getResp = await NfcManager.isoDepHandler.transceive(getRespCmd);
        if (getResp && getResp.length >= 2) {
          sw1 = getResp[getResp.length - 2];
          sw2 = getResp[getResp.length - 1];
          const data = getResp.slice(0, getResp.length - 2);
          return {
            ok: sw1 === 0x90 && sw2 === 0x00,
            sw: bytesToHex([sw1, sw2]),
            sw1,
            sw2,
            data,
            dataHex: bytesToHex(data),
            rawHex: bytesToHex(getResp),
          };
        }
      } catch {
        // Ignorer l'erreur de get response
      }
    }

    const data = resp.slice(0, resp.length - 2);
    const swHex = bytesToHex([sw1, sw2]);
    return {
      ok: swHex === '9000',
      sw: swHex,
      sw1,
      sw2,
      data,
      dataHex: bytesToHex(data),
      rawHex: bytesToHex(resp),
    };
  } catch (err: any) {
    return {
      ok: false,
      sw: 'ERR',
      sw1: 0,
      sw2: 0,
      data: [],
      dataHex: '',
      rawHex: `ERR: ${err?.message || String(err)}`,
      error: err?.message || String(err),
    };
  }
}
