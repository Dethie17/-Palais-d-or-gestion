/**
 * Import d'élèves depuis un fichier Excel (.xlsx).
 *
 * Le fichier ne touche JAMAIS la base directement : il est lu localement,
 * normalisé, validé ligne par ligne, puis présenté en aperçu. Seules les
 * lignes confirmées par l'administrateur sont inscrites, via le même chemin
 * que l'inscription manuelle.
 *
 * Modèle fixe (première ligne = en-têtes exacts) :
 *   parent_tel | parent_nom | parent_prenom | prenom | nom | classe | cycle
 * `cycle` est optionnel (déduit de la classe sinon).
 *
 * `parent_tel` est OBLIGATOIRE : le numéro du parent est son identifiant de
 * connexion, et c'est la clé à laquelle ses enfants sont rattachés. Un
 * identifiant libre (« awa », « parent1 ») séparerait l'accès du parent de
 * ses enfants — c'est pourquoi la colonne historique `parent_username`
 * n'est acceptée que si elle contient elle-même un numéro.
 *
 * Dangers neutralisés ici :
 * - cellules piégées (`=CMD(`, formules) : tout est lu comme TEXTE BRUT,
 *   jamais évalué ni ré-ouvert tel quel ;
 * - accents/casse/espaces (« CE2 » vs « ce2 ») : normalisés pour la
 *   comparaison, originaux conservés pour l'enregistrement ;
 * - doublons (fichier rejoué) : clé parent + prénom + nom + classe, seconde
 *   occurrence ignorée et signalée.
 *
 * LECTURE / ÉCRITURE : `read-excel-file` et `write-excel-file`. Pas de
 * `xlsx` (SheetJS) : la version publiée sur npm est ancienne et connue
 * pour des failles de prototype pollution et de ReDoS ; les deux
 * bibliothèques retenues sont sans dépendance et fonctionnent dans le
 * navigateur.
 */
import readXlsxFile from 'read-excel-file';
import writeXlsxFile, { type SheetData } from 'write-excel-file';
import { cycleOfClass, canonicalClassName } from '@/lib/schoolCycles';
import { childNaturalKey } from '@/lib/childIdentity';
import { normalizeParentPhone, isValidParentPhone } from '@/lib/parentIdentity';
import type { SchoolCycle } from '@/types/menu';

/** En-têtes exacts attendus en première ligne. */
export const IMPORT_HEADERS = [
  'parent_tel',
  'parent_nom',
  'parent_prenom',
  'prenom',
  'nom',
  'classe',
  'cycle',
] as const;

/**
 * Ancien en-tête, accepté pour que les fichiers déjà préparés restent
 * exploitables. Sa valeur n'est retenue que si elle est un numéro.
 */
export const LEGACY_PARENT_HEADER = 'parent_username';

/** Lignes max par fichier : au-delà, on refuse plutôt que ramer. */
export const MAX_IMPORT_ROWS = 2000;
/** Taille max du fichier : 5 Mo. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ImportRow {
  /** N° de ligne dans le fichier (1 = en-têtes). */
  line: number;
  /** Numéro du parent — SON IDENTIFIANT (9 chiffres). */
  parentUsername: string;
  parentNom: string;
  parentPrenom: string;
  parentTel: string;
  prenom: string;
  nom: string;
  classe: string;
  cycle: SchoolCycle;
}

export interface RowIssue {
  line: number;
  message: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Lignes rejetées avant même l'analyse (illisibles). */
  issues: RowIssue[];
}

/** Tout est texte : une cellule n'est jamais exécutée. */
function cleanCell(value: unknown): string {
  if (value == null) return '';
  // Une date devient une date ISO : le texte brut d'un Date est illisible
  // (« Tue Oct 06 2026 … ») et ne se comparerait à rien.
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  }
  // Retire volontairement les caractères de contrôle des cellules.
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/** Comparaison insensible aux accents, à la casse et aux espaces. */
export function normKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clé de détection des doublons : PARENT + élève + classe.
 *
 * Le parent fait partie de la clé : deux familles peuvent chacune avoir un
 * enfant nommé « Awa Diallo » en CE2 — ce sont deux enfants différents.
 * Sans le parent dans la clé, le second était refusé à tort (enfant
 * « manquant »), et un fichier rejoué après correction du parent créait un
 * doublon de QR.
 */
export function duplicateKey(r: Pick<ImportRow, 'parentUsername' | 'prenom' | 'nom' | 'classe'>): string {
  return childNaturalKey(r.parentUsername, r.prenom, r.nom, r.classe);
}

/**
 * Lit la première feuille d'un classeur et rend une grille de TEXTE.
 *
 * Une cellule porteuse d'une formule est lue comme son texte affiché :
 * elle n'est jamais évaluée, jamais ré-ouverte. Un fichier qui n'est pas
 * un classeur valide est rejeté avec un message lisible (pas une pile
 * d'erreurs technique).
 */
async function readSheetGrid(file: File | Blob): Promise<string[][]> {
  let rows: unknown[][];
  try {
    rows = await readXlsxFile(file);
  } catch {
    throw new Error('Fichier illisible : ce n’est pas un classeur Excel (.xlsx) valide.');
  }
  return rows.map((row) => row.map((cell) => cleanCell(cell)));
}

/**
 * Lit un classeur et rend les lignes brutes. Les lignes entièrement vides
 * sont ignorées ; les autres sont nettoyées puis validées.
 */
export async function parseImportFile(file: File | Blob): Promise<ParsedImport> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Fichier trop volumineux (5 Mo maximum).');
  }
  const grid = await readSheetGrid(file);
  if (grid.length === 0) throw new Error('Feuille vide.');
  const header = grid[0].map((h) => cleanCell(h).toLowerCase());
  const missing = IMPORT_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(`En-têtes manquants : ${missing.join(', ')}. Téléchargez le modèle.`);
  }
  const idx = (name: string) => header.indexOf(name);
  const legacyIdx = idx(LEGACY_PARENT_HEADER);
  const rows: ImportRow[] = [];
  const issues: RowIssue[] = [];
  const body = grid.slice(1, MAX_IMPORT_ROWS + 1);
  for (let i = 0; i < body.length; i += 1) {
    const cells = body[i];
    if (cells.every((c) => cleanCell(c) === '')) continue;
    const line = i + 2;
    const get = (name: string) => cleanCell(cells[idx(name)]);
    // Identité du parent : le numéro. L'ancien identifiant n'est repris que
    // s'il contient lui-même un numéro.
    const legacy = legacyIdx >= 0 ? cleanCell(cells[legacyIdx]) : '';
    const phoneSource = get('parent_tel') || (isValidParentPhone(legacy) ? legacy : '');
    const err = validateCells(line, {
      parentUsername: phoneSource,
      parentNom: get('parent_nom'),
      parentPrenom: get('parent_prenom'),
      parentTel: phoneSource,
      prenom: get('prenom'),
      nom: get('nom'),
      classe: get('classe'),
      cycle: get('cycle'),
    });
    if (typeof err === 'string') {
      issues.push({ line, message: err });
      continue;
    }
    rows.push({ line, ...err });
  }
  if (grid.length - 1 > MAX_IMPORT_ROWS) {
    issues.push({ line: MAX_IMPORT_ROWS + 2, message: `Fichier tronqué à ${MAX_IMPORT_ROWS} lignes.` });
  }
  return { rows, issues };
}

interface RawCells {
  parentUsername: string;
  parentNom: string;
  parentPrenom: string;
  parentTel: string;
  prenom: string;
  nom: string;
  classe: string;
  cycle: string;
}

/** Valide une ligne : message d'erreur ou ligne normalisée prête à inscrire. */
function validateCells(
  line: number,
  c: RawCells,
): string | Omit<ImportRow, 'line'> {
  void line;
  const phone = normalizeParentPhone(c.parentTel);
  if (!isValidParentPhone(phone)) {
    return `numéro du parent invalide (« ${c.parentTel || 'vide'} » : 9 chiffres, ex 77 123 45 67). C’est son identifiant de connexion.`;
  }
  if (!c.prenom || c.prenom.length > 60) return 'prénom élève manquant ou trop long (60 max).';
  if (!c.nom || c.nom.length > 60) return 'nom élève manquant ou trop long (60 max).';
  if (!c.classe || c.classe.length > 40) return 'classe manquante ou trop longue (40 max).';
  const cycleRaw = c.cycle.trim().toLowerCase();
  const cycle: SchoolCycle =
    cycleRaw === 'lycee' || cycleRaw === 'lycée'
      ? 'lycee'
      : cycleRaw === 'maternelle' || cycleRaw === 'collège' || cycleRaw === 'college'
        ? (cycleRaw as SchoolCycle)
        : cycleRaw === 'primaire' || cycleRaw === ''
          ? cycleOfClass(c.classe)
          : null as unknown as SchoolCycle;
  if (!cycle) return `cycle inconnu (« ${c.cycle} » : laissez vide ou mettez maternelle/primaire/college/lycee).`;
  return {
    parentUsername: phone,
    parentNom: c.parentNom.slice(0, 60),
    parentPrenom: c.parentPrenom.slice(0, 60),
    parentTel: phone,
    prenom: c.prenom,
    nom: c.nom,
    classe: canonicalClassName(c.classe),
    cycle,
  };
}

export interface ImportAnalysis {
  /** Lignes prêtes à inscrire. */
  toCreate: ImportRow[];
  /** Doublons ignorés (déjà en base ou répétés dans le fichier). */
  duplicates: { line: number; reason: string }[];
  /** Parents à créer (numéro → infos de la première ligne). */
  parentsToCreate: { username: string; nom: string; prenom: string; tel: string }[];
}

/**
 * Répartit les lignes : à créer, doublons, parents manquants.
 * `existingKeys` = clés parent|prénom|nom|classe déjà en base.
 * `existingParents` = numéros de parents déjà connus.
 */
export function analyzeImport(
  rows: ImportRow[],
  existingKeys: Set<string>,
  existingParents: Set<string>,
): ImportAnalysis {
  const toCreate: ImportRow[] = [];
  const duplicates: { line: number; reason: string }[] = [];
  const parentsToCreate = new Map<string, { username: string; nom: string; prenom: string; tel: string }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = duplicateKey(row);
    if (existingKeys.has(key)) {
      duplicates.push({ line: row.line, reason: `${row.prenom} ${row.nom} (${row.classe}) déjà inscrit pour ce parent.` });
      continue;
    }
    if (seen.has(key)) {
      duplicates.push({ line: row.line, reason: `${row.prenom} ${row.nom} (${row.classe}) répété dans le fichier.` });
      continue;
    }
    seen.add(key);
    toCreate.push(row);
    if (!existingParents.has(row.parentUsername) && !parentsToCreate.has(row.parentUsername)) {
      parentsToCreate.set(row.parentUsername, {
        username: row.parentUsername,
        nom: row.parentNom,
        prenom: row.parentPrenom,
        tel: row.parentTel,
      });
    }
  }
  return { toCreate, duplicates, parentsToCreate: [...parentsToCreate.values()] };
}

/**
 * Convertit une grille de valeurs brutes en cellules `write-excel-file`.
 *
 * La bibliothèque n'écrit un contenu que si la cellule est un objet
 * `{ value }` : une valeur nue produirait une ligne vide (le fichier
 * s'ouvrirait sans aucune donnée).
 */
export function toSheetData(rows: (string | number | boolean | Date | null)[][]): SheetData {
  return rows.map((row) => row.map((value) => ({ value }))) as unknown as SheetData;
}

/** Construit le fichier modèle à remplir (en-têtes seuls, sans exemple piégeable). */
export async function buildTemplateBlob(): Promise<Blob> {
  return writeXlsxFile(toSheetData([[...IMPORT_HEADERS]]), {
    sheet: 'Eleves',
    columns: IMPORT_HEADERS.map((h) => ({ width: Math.max(h.length + 2, 16) })),
  });
}

/* ------------------------------------------------------------------ */
/* Import PARENTS (accès par numéro de téléphone, sans mot de passe)   */
/* ------------------------------------------------------------------ */

/** En-têtes exacts du modèle parents. Les trois colonnes enfants sont optionnelles. */
export const PARENT_IMPORT_HEADERS = ['prenom', 'nom', 'telephone', 'prenom_enfant', 'nom_enfant', 'classe_enfant'] as const;

export interface ParentImportRow {
  /** N° de ligne du fichier (1 = en-têtes). */
  line: number;
  prenom: string;
  nom: string;
  /** Numéro normalisé : 9 chiffres (ex 771234567). */
  telephone: string;
  prenomEnfant?: string;
  nomEnfant?: string;
  classeEnfant?: string;
}

export interface ParsedParentImport {
  rows: ParentImportRow[];
  issues: RowIssue[];
}

/** Ne garde que les chiffres d'un numéro (tolère espaces, points, +221…). */
export function normalizePhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('221') && digits.length === 12 ? digits.slice(3) : digits;
}

function parentPhone(value: string): string {
  const digits = normalizePhoneDigits(value);
  return /^[67]\d{8}$/.test(digits) ? digits : '';
}

/**
 * Lit un classeur de parents : `prenom | nom | telephone`.
 * Les numéros sont l'identifiant unique ; un numéro répété est signalé.
 */
export async function parseParentImportFile(file: File | Blob): Promise<ParsedParentImport> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Fichier trop volumineux (5 Mo maximum).');
  }
  const grid = await readSheetGrid(file);
  if (grid.length === 0) throw new Error('Feuille vide.');
  const header = grid[0].map((h) => cleanCell(h).toLowerCase()
    .normalize('NFD').replace(/[ - ]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_'));
  const required = ['prenom', 'nom', 'telephone'] as const;
  const missing = required.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(`En-têtes manquants : ${missing.join(', ')}. Téléchargez le modèle.`);
  }
  const idx = (name: string) => header.indexOf(name);
  const rows: ParentImportRow[] = [];
  const issues: RowIssue[] = [];
  const body = grid.slice(1, MAX_IMPORT_ROWS + 1);
  for (let i = 0; i < body.length; i += 1) {
    const cells = body[i];
    if (cells.every((c) => cleanCell(c) === '')) continue;
    const line = i + 2;
    const get = (name: string) => cleanCell(cells[idx(name)]);
    const prenom = get('prenom').slice(0, 60);
    const nom = get('nom').slice(0, 60);
    const phone = parentPhone(get('telephone'));
    const prenomEnfant = get('prenom_enfant').slice(0, 60);
    const nomEnfant = get('nom_enfant').slice(0, 60);
    const classeEnfant = get('classe_enfant').slice(0, 60);
    if (!prenom) {
      issues.push({ line, message: 'prénom manquant.' });
      continue;
    }
    if (!nom) {
      issues.push({ line, message: 'nom manquant.' });
      continue;
    }
    if (!phone) {
      issues.push({ line, message: `téléphone invalide (« ${get('telephone') || 'vide'} » : 9 chiffres, ex 77 123 45 67).` });
      continue;
    }
    rows.push({
      line,
      prenom,
      nom,
      telephone: phone,
      ...(prenomEnfant ? { prenomEnfant } : {}),
      ...(nomEnfant ? { nomEnfant } : {}),
      ...(classeEnfant ? { classeEnfant } : {}),
    });
  }
  if (grid.length - 1 > MAX_IMPORT_ROWS) {
    issues.push({ line: MAX_IMPORT_ROWS + 2, message: `Fichier tronqué à ${MAX_IMPORT_ROWS} lignes.` });
  }
  return { rows, issues };
}

export interface ParentImportAnalysis {
  toCreate: ParentImportRow[];
  duplicates: { line: number; reason: string }[];
}

/** Sépare les parents nouveaux de ceux déjà enregistrés (numéro déjà connu). */
export function analyzeParentImport(
  rows: ParentImportRow[],
  existingPhones: Set<string>,
): ParentImportAnalysis {
  const toCreate: ParentImportRow[] = [];
  const duplicates: { line: number; reason: string }[] = [];
  for (const row of rows) {
    if (existingPhones.has(row.telephone)) {
      duplicates.push({ line: row.line, reason: `${row.prenom} ${row.nom} — ${row.telephone} déjà enregistré.` });
      continue;
    }
    toCreate.push(row);
  }
  return { toCreate, duplicates };
}

/** Modèle Excel parents (en-têtes seuls). */
export async function buildParentTemplateBlob(): Promise<Blob> {
  return writeXlsxFile(toSheetData([[...PARENT_IMPORT_HEADERS]]), {
    sheet: 'Parents',
    columns: PARENT_IMPORT_HEADERS.map((h) => ({ width: Math.max(h.length + 2, 16) })),
  });
}
