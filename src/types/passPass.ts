export interface PassPassContract {
  id: string;
  name: string;
  type: 'carnet' | 'subscription' | 'single' | 'other';
  balance?: number; // Nombre de voyages restants
  validFrom?: string; // Format DD/MM/YYYY
  validUntil?: string; // Format DD/MM/YYYY
  network: string; // Ex: "Artis - Grand Arras" ou "Pass Pass Régional"
}

export interface PassPassValidationEvent {
  timestamp: Date;
  lineName?: string;
  stopName?: string;
  isTransfer: boolean;
}

export interface TransferStatus {
  isActive: boolean;
  minutesRemaining: number;
  lastValidationTime: Date | null;
  expirationTime: Date | null;
}

export interface PassPassCardData {
  cardId: string; // Numéro de carte ou UID formaté (ex: 04:A2:8F:...)
  profile: string; // Ex: "Tout Public", "Jeune / Scolaire", etc.
  contracts: PassPassContract[];
  validations: PassPassValidationEvent[];
  transferStatus: TransferStatus;
  scannedAt: Date;
  rawDump?: Record<string, string>; // Données brutes APDU Calypso pour analyse et décodage
}
