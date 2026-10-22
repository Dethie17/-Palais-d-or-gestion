import writeXlsxFile, { type SheetData } from 'write-excel-file';

/**
 * Fixture .xlsx pour les tests.
 *
 * Le projet n'utilise plus `xlsx` (SheetJS) : la lecture passe par
 * `read-excel-file`, l'écriture par `write-excel-file`. Les tests
 * construisent donc leurs classeurs avec la même bibliothèque que
 * l'application — un fixture produit par un autre outil pourrait cacher
 * une différence de lecture.
 */
export async function xlsxFile(
  rows: unknown[][],
  name = 'test.xlsx',
  sheetName = 'Sheet1',
): Promise<File> {
  // `write-excel-file` n'écrit une valeur que si la cellule est `{ value }`.
  const sheet = rows.map((row) =>
    row.map((value) => ({ value: value as string | number | boolean | Date | null })),
  ) as unknown as SheetData;
  const blob = await writeXlsxFile(sheet, { sheet: sheetName });
  return new File([blob], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
