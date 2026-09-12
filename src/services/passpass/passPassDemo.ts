import { PassPassCardData } from '../../types/passPass';
import { computeTransferStatus } from './calypsoDecoder';

/**
 * Données de démo avec dump simulé pour les tests hors matériel NFC physique.
 */
export function getDemoCardData(scenario: 'carnet' | 'subscription' | 'scolaire' = 'carnet'): PassPassCardData {
  const now = new Date();

  if (scenario === 'carnet') {
    const validationTime = new Date(now.getTime() - 22 * 60 * 1000);
    return {
      cardId: '04:7A:B3:C2:59:81:40',
      profile: 'Pass Pass Tout Public',
      contracts: [
        {
          id: 'c1',
          name: 'Carnet 10 Voyages Artis',
          type: 'carnet',
          balance: 6,
          network: 'Artis - Grand Arras',
        },
      ],
      validations: [
        {
          timestamp: validationTime,
          lineName: 'Ligne 1',
          stopName: 'Gare Urbaine (Quai A)',
          isTransfer: false,
        },
      ],
      transferStatus: computeTransferStatus(validationTime),
      scannedAt: now,
      rawDump: {
        TAG_ID: '047AB3C2598140',
        SELECT_AID_EXACT: '6F25840BA000000291A00000019102A516BF0C13C70800000000047AB3C25981409000',
        SELECT_DF_2000: '851700020000001212000001030101004141410000000000009000',
        SEL_EF_2001_ENV: '9000',
        EF_2001_ENV_REC_1: '070104000102030405060708090A9000',
        SEL_EF_2020_CONTRACTS: '9000',
        EF_2020_CONTRACTS_REC_1: '09012A3B4C5D6E7F8090A0B0C0D0E09000',
        SEL_EF_2069_COUNTERS: '9000',
        EF_2069_COUNTERS_REC_1: '0000069000',
      },
    };
  } else if (scenario === 'subscription') {
    const validationTime = new Date(now.getTime() - 3 * 3600 * 1000);
    return {
      cardId: '04:1E:99:4D:82:30:55',
      profile: 'Abonné Grand Arras',
      contracts: [
        {
          id: 'c2',
          name: 'Pass Mensuel Tout Public',
          type: 'subscription',
          validFrom: '01/09/2026',
          validUntil: '30/09/2026',
          network: 'Artis - Réseau Urbain & Périurbain',
        },
      ],
      validations: [
        {
          timestamp: validationTime,
          lineName: 'Ma Citadine',
          stopName: 'Théâtre',
          isTransfer: false,
        },
      ],
      transferStatus: computeTransferStatus(validationTime),
      scannedAt: now,
      rawDump: {
        TAG_ID: '041E994D823055',
        SELECT_AID_EXACT: '6F25840BA000000291A00000019102A516BF0C13C70800000000041E994D8230559000',
        SELECT_DF_2000: '851700020000001212000001030101004141410000000000009000',
        SEL_EF_2001_ENV: '9000',
        EF_2001_ENV_REC_1: '070104000102030405060708090A9000',
        SEL_EF_2020_CONTRACTS: '9000',
        EF_2020_CONTRACTS_REC_1: '09012B263C268090A0B0C0D0E09000',
      },
    };
  } else {
    return {
      cardId: '04:FF:12:33:67:89:10',
      profile: 'Pass Pass Scolaire',
      contracts: [
        {
          id: 'c3',
          name: 'Abonnement Scolaire CUA',
          type: 'subscription',
          validFrom: '01/09/2026',
          validUntil: '30/06/2027',
          network: 'Artis - Circuits & Lignes Régulières',
        },
      ],
      validations: [],
      transferStatus: computeTransferStatus(null),
      scannedAt: now,
      rawDump: {
        TAG_ID: '04FF1233678910',
        SELECT_AID_EXACT: '6F25840BA000000291A00000019102A516BF0C13C7080000000004FF12336789109000',
        SELECT_DF_2000: '851700020000001212000001030101004141410000000000009000',
        SEL_EF_2001_ENV: '9000',
        EF_2001_ENV_REC_1: '070104000102030405060708090A9000',
        SEL_EF_2020_CONTRACTS: '9000',
        EF_2020_CONTRACTS_REC_1: '09012C2640278090A0B0C0D0E09000',
      },
    };
  }
}
