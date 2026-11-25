/**
 * Normalise un lien d'image saisi par l'utilisateur pour qu'il s'affiche
 * directement dans une balise <img>.
 *
 * Les liens « page » (Google Drive, Dropbox, GitHub) ne sont pas des images :
 * le navigateur affiche alors une image cassée. On les convertit en lien
 * direct équivalent. Les URL relatives (/images/...) sont conservées.
 */
export function normalizeImageUrl(raw: string | null | undefined): string {
  let url = (raw ?? '').trim();
  if (!url) return '';
  if (url.startsWith('//')) url = `https:${url}`;
  if (/^http:\/\//i.test(url)) url = `https://${url.slice('http://'.length)}`;

  const drive = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=[^&]*&)?id=)|docs\.google\.com\/[^/]+\/d\/)([\w-]{10,})/.exec(url);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1600`;

  try {
    const parsed = new URL(url);
    if (/(^|\.)dropbox\.com$/i.test(parsed.hostname)) {
      parsed.searchParams.delete('dl');
      parsed.searchParams.set('raw', '1');
      return parsed.toString();
    }
    if (parsed.hostname === 'github.com') {
      const match = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(parsed.pathname);
      if (match) {
        return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`;
      }
    }
  } catch {
    return url;
  }

  return url;
}

/** Vrai si la valeur ressemble à une URL d'image exploitable. */
export function isImageUrl(raw: string | null | undefined): boolean {
  const url = normalizeImageUrl(raw);
  if (!url) return false;
  if (url.startsWith('/') || url.startsWith('data:image/')) return true;
  return /^https:\/\//i.test(url);
}
