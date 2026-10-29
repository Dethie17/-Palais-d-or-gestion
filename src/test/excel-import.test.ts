import { describe, it, expect } from 'vitest';
import { xlsxFile } from '@/test/helpers/xlsxFixture';
import {
  IMPORT_HEADERS,
  analyzeImport,
  analyzeParentImport,
  buildParentTemplateBlob,
  buildTemplateBlob,
  duplicateKey,
  normKey,
  parseImportFile,
  parseParentImportFile,
} from '@/lib/excelImport';

/**
 * L'import Excel ne doit jamais écrire de travers : en-têtes imposés,
 * lignes sales rejetées avec leur numéro, doublons détectés avant écriture.
 *
 * Règle d'identité : le NUMÉRO du parent est son identifiant de connexion
 * et la clé de rattachement de ses enfants. Un doublon d'enfant se juge donc
 * sur le triplet parent + prénom + nom + classe.
 */

function workbook(rows: unknown[][]): Promise<File> {
  return xlsxFile(rows, 'test.xlsx', 'Eleves');
}

const HEAD = [...IMPORT_HEADERS];
const row = (o: Partial<Record<string, string>> = {}) => [
  o.parent_tel ?? '771234567',
  o.parent_nom ?? 'Diallo',
  o.parent_prenom ?? 'Awa',
  o.prenom ?? 'Moussa',
  o.nom ?? 'Diallo',
  o.classe ?? 'CE2',
  o.cycle ?? '',
];

describe('Modèle et normalisation', () => {
  it('le modèle contient exactement les en-têtes attendus', async () => {
    const parsed = await parseImportFile(await buildTemplateBlob());
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues).toHaveLength(0);
  });

  it('compare sans accents ni casse pour les doublons', () => {
    expect(normKey('  José  DIALLO ')).toBe(normKey('jose diallo'));
    expect(
      duplicateKey({ parentUsername: '771234567', prenom: 'Moussa', nom: 'Diallo', classe: 'CE2' }),
    ).toBe(
      duplicateKey({ parentUsername: '771234567', prenom: 'moussa', nom: 'DIALLO', classe: 'ce2' }),
    );
  });

  it('deux enfants homonymes de deux parents différents ne sont PAS des doublons', () => {
    expect(
      duplicateKey({ parentUsername: '771234567', prenom: 'Awa', nom: 'Diallo', classe: 'CE2' }),
    ).not.toBe(
      duplicateKey({ parentUsername: '760000000', prenom: 'Awa', nom: 'Diallo', classe: 'CE2' }),
    );
  });
});

describe('Lecture et validation', () => {
  it('accepte des lignes valides et déduit le cycle', async () => {
    const parsed = await parseImportFile(await workbook([HEAD, row()]));
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].cycle).toBe('primaire');
    // L'identifiant du parent EST son numéro.
    expect(parsed.rows[0].parentUsername).toBe('771234567');
  });

  it('refuse un fichier sans les bons en-têtes', async () => {
    await expect(parseImportFile(await workbook([['a', 'b']]))).rejects.toThrow(/En-têtes manquants/);
  });

  it('refuse une ligne sans numéro de parent (identifiant obligatoire)', async () => {
    const parsed = await parseImportFile(await workbook([HEAD, row({ parent_tel: '' })]));
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].message).toMatch(/numéro du parent/);
  });

  it('signale chaque ligne fautive avec son numéro', async () => {
    const parsed = await parseImportFile(
      await workbook([
        HEAD,
        row(),
        row({ parent_tel: '771234567', prenom: 'K', nom: '', classe: '' }),
        row({ parent_tel: '123' }),
      ]),
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.issues).toHaveLength(2);
    expect(parsed.issues[0].line).toBe(3);
    expect(parsed.issues[1].line).toBe(4);
    expect(parsed.issues[1].message).toMatch(/numéro du parent/);
  });

  it('ignore les lignes entièrement vides', async () => {
    const parsed = await parseImportFile(await workbook([HEAD, row(), ['', '', '', '', '', '', '']]));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.issues).toHaveLength(0);
  });

  it('traite les cellules comme du texte brut (pas de formule exécutée)', async () => {
    const parsed = await parseImportFile(await workbook([HEAD, row({ prenom: '=CMD(1)', nom: '+999' })]));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].prenom).toBe('=CMD(1)');
  });
});

describe('Analyse avant écriture', () => {
  const base = {
    line: 2, parentUsername: '771234567', parentNom: 'Diallo', parentPrenom: 'Awa',
    parentTel: '771234567', prenom: 'Moussa', nom: 'Diallo', classe: 'CE2', cycle: 'primaire' as const,
  };
  it('ignore les déjà-inscrits et les répétés, liste les parents à créer', () => {
    const analysis = analyzeImport(
      [
        base,
        { ...base, line: 3 },
        {
          ...base, line: 4, prenom: 'Aminata', parentUsername: '760000000',
          parentNom: 'Sow', parentPrenom: 'Ibrahim', parentTel: '760000000',
        },
      ],
      new Set([duplicateKey({ parentUsername: '771234567', prenom: 'Samba', nom: 'Ndiaye', classe: 'CM2' })]),
      new Set(['771234567']),
    );
    expect(analysis.toCreate.map((r) => r.line)).toEqual([2, 4]);
    expect(analysis.duplicates.map((d) => d.line)).toEqual([3]);
    expect(analysis.parentsToCreate.map((p) => p.username)).toEqual(['760000000']);
  });

  it('un doublon en base avec une casse différente est quand même détecté', () => {
    const analysis = analyzeImport(
      [{ ...base, prenom: 'MOUSSA', nom: 'diallo', classe: 'ce2' }],
      new Set([duplicateKey({ parentUsername: '771234567', prenom: 'Moussa', nom: 'Diallo', classe: 'CE2' })]),
      new Set(['771234567']),
    );
    expect(analysis.toCreate).toHaveLength(0);
    expect(analysis.duplicates).toHaveLength(1);
  });

  it('un homonyme chez un AUTRE parent est bien créé', () => {
    const analysis = analyzeImport(
      [{ ...base, parentUsername: '760000000', parentTel: '760000000' }],
      new Set([duplicateKey({ parentUsername: '771234567', prenom: 'Moussa', nom: 'Diallo', classe: 'CE2' })]),
      new Set(['771234567']),
    );
    expect(analysis.toCreate).toHaveLength(1);
    expect(analysis.duplicates).toHaveLength(0);
  });
});

describe('Import parents (accès par numéro)', () => {
  const PHEAD = ['prenom', 'nom', 'telephone'];

  it('le modèle parents ne contient que les en-têtes attendus', async () => {
    const parsed = await parseParentImportFile(await buildParentTemplateBlob());
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues).toHaveLength(0);
  });

  it('normalise le numéro (+221, espaces) et nettoie les noms', async () => {
    const parsed = await parseParentImportFile(await workbook([PHEAD, ['  Awa ', 'Diallo', '+221 77 123 45 67']]),
    );
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows).toEqual([
      { line: 2, prenom: 'Awa', nom: 'Diallo', telephone: '771234567' },
    ]);
  });

  it('importe plusieurs lignes d’enfants pour le même parent', async () => {
    const headers = [...PHEAD, 'prenom_enfant', 'nom_enfant', 'classe_enfant'];
    const parsed = await parseParentImportFile(await workbook([
      headers,
      ['Awa', 'Diallo', '771234567', 'Fatou', 'Diallo', 'CI'],
      ['Awa', 'Diallo', '771234567', 'Moussa', 'Diallo', '6A'],
    ]));
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].prenomEnfant).toBe('Fatou');
    expect(parsed.rows[0].classeEnfant).toBe('CI');
    expect(parsed.rows[1].prenomEnfant).toBe('Moussa');
  });

  it('rejette numéro invalide et nom parent manquant', async () => {
    const parsed = await parseParentImportFile(await workbook([
      PHEAD,
      ['Awa', 'Diallo', '123'],
      ['', 'Sow', '771234567'],
    ]));
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues.map((i) => i.line)).toEqual([2, 3]);
  });

  it('sépare les parents déjà enregistrés des nouveaux', () => {
    const rows = [
      { line: 2, prenom: 'Awa', nom: 'Diallo', telephone: '771234567' },
      { line: 3, prenom: 'Moussa', nom: 'Ndiaye', telephone: '760000000' },
    ];
    const analysis = analyzeParentImport(rows, new Set(['760000000']));
    expect(analysis.toCreate.map((r) => r.telephone)).toEqual(['771234567']);
    expect(analysis.duplicates.map((d) => d.line)).toEqual([3]);
  });
});
