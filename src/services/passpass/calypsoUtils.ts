/**
 * Utilitaires de conversion et formatage pour Calypso et Intercode.
 */

/**
 * Convertit un tableau d'octets en chaîne hexadécimale majuscule.
 */
export function bytesToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => (b & 0xff).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Formate un UID/ID de carte en blocs lisibles (ex: C4:F1:DC:4F).
 */
export function formatCardId(rawId: string): string {
  if (!rawId) return 'Inconnu';
  const clean = rawId.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
  const chunks = clean.match(/.{1,2}/g);
  return chunks ? chunks.join(':') : rawId;
}

/**
 * Convertit une chaîne hexadécimale en flux binaire '0' et '1'.
 */
export function hexToBitString(hex: string): string {
  let bitstr = '';
  const clean = hex.replace(/[^A-Fa-f0-9]/g, '');
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.substring(i, i + 2), 16);
    bitstr += byte.toString(2).padStart(8, '0');
  }
  return bitstr;
}

/**
 * Décode une date Intercode (nombre de jours depuis le 1er janvier 1997).
 */
export function parseIntercodeDays(days: number): string {
  if (!days || days <= 0 || days > 35000) return '';
  const epoch = new Date(1997, 0, 1);
  const target = new Date(epoch.getTime() + days * 86400000);
  if (target.getFullYear() < 2018 || target.getFullYear() > 2040) return '';
  const d = String(target.getDate()).padStart(2, '0');
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const y = target.getFullYear();
  return `${d}/${m}/${y}`;
}
