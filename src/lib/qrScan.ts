/**
 * Scan QR universel (tous navigateurs) — helpers purs.
 * Stratégie dans ValidationPage :
 * 1. Caméra live via html5-qrcode (moteur ZXing intégré → Chrome, Edge, Firefox,
 *    Safari, Opera… ; détecteur natif utilisé en priorité quand dispo).
 * 2. Photo du badge décodée en local (aucune API caméra requise → marche PARTOUT,
 *    y compris en HTTP non sécurisé où la caméra live est bloquée par tous les navigateurs).
 * 3. Saisie manuelle du code + service depuis la liste des élèves.
 */

/** Caméra arrière de préférence (labels FR/EN), sinon la dernière, sinon null. */
export function pickBackCameraId(devices: { id: string; label: string }[]): string | null {
  if (devices.length === 0) return null;
  const back = devices.find((d) => /back|rear|environment|arri[eè]re|post[eé]rieur/i.test(d.label));
  return (back ?? devices[devices.length - 1]).id;
}

/**
 * Contexte sécurisé requis par TOUS les navigateurs pour la caméra live
 * (getUserMedia) : HTTPS ou localhost. Sans ça, seule la photo/saisie marche.
 */
export function isSecureScanContext(hostname: string, protocol: string): boolean {
  return (
    protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

/** Message FR clair selon l'échec de démarrage du scan live. */
export function friendlyScanError(errorName: string, secure: boolean): string {
  if (!secure) {
    return 'Caméra bloquée : cette page doit être en HTTPS (ou localhost) — c’est exigé par tous les navigateurs. En attendant : photo du badge ou saisie manuelle ci-dessous.';
  }
  switch (errorName) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Caméra refusée : autorisez l’accès dans le navigateur (icône cadenas à côté de l’adresse), ou utilisez la photo du badge / la saisie manuelle.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Aucune caméra trouvée sur cet appareil : utilisez la photo du badge ou la saisie manuelle.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Caméra occupée par une autre application : fermez-la puis réessayez, ou utilisez la photo du badge.';
    case 'NotSupportedError':
      return 'Caméra non supportée dans ce contexte : utilisez la photo du badge ou la saisie manuelle.';
    default:
      return 'Scan live impossible : utilisez la photo du badge, la saisie manuelle, ou servez depuis la liste des élèves.';
  }
}

/** Nom d'erreur normalisé depuis n'importe quelle exception de démarrage. */
export function scanErrorName(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'name' in err && typeof (err as { name: unknown }).name === 'string') {
    return (err as { name: string }).name;
  }
  return 'UnknownError';
}
