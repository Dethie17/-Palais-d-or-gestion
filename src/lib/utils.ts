import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
/**
 * Formate un nombre en devise FCFA
 * @param amount - Le montant à formater
 * @param showDecimals - Afficher les décimales (par défaut: true)
 * @returns Le montant formaté en FCFA
 */
export function formatCurrency(amount: number, showDecimals: boolean = true): string {
  const formatted = showDecimals 
    ? amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : Math.round(amount).toLocaleString('fr-FR');
  return `${formatted} FCFA`;
}

/**
 * Convertit un montant EUR en FCFA (1 EUR ≈ 655.957 FCFA)
 * @param eurAmount - Montant en euros
 * @returns Montant en FCFA
 */
export function eurToFcfa(eurAmount: number): number {
  return Math.round(eurAmount * 655.957);
}