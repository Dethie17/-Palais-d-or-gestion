import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import {
  Establishment,
  Formula,
  Subscription,
  ORestoPayment,
  ORestoPaymentMethod,
  MealValidation,
} from '@/types/menu';
import { supabase } from '@/lib/supabase';
import {
  checkWaveCode,
  clearWaveCode,
  initiateWavePayment,
  isMobileMethod,
  type WavePaymentRequest,
} from '@/lib/wave';
import { getClientQrToken, isPersonalQrToken } from '@/lib/clientQr';

const LS_KEYS = {
  establishments: 'o-resto-establishments',
  formulas: 'o-resto-formulas',
  subscriptions: 'o-resto-subscriptions',
  payments: 'o-resto-payments',
  validations: 'o-resto-validations',
  ticketIntents: 'o-resto-ticket-intents',
};

const DEFAULT_ESTABLISHMENTS: Establishment[] = [
  { id: 'E1', name: 'École Les Lauriers', address: 'Thiès, Sénégal', manager: 'Direction des études', phone: '+221 33 000 00 01' },
  { id: 'E2', name: 'Entreprise Sahel SARL', address: 'Dakar, Sénégal', manager: 'Responsable RH', phone: '+221 33 000 00 02' },
];

const DEFAULT_FORMULAS: Formula[] = [
  { id: 'F1', name: 'Midi Semaine', description: '1 repas le midi, du lundi au vendredi', price: 7500, durationDays: 7, mealsIncluded: 5, rules: '1 repas / jour, service du midi uniquement', kind: 'subscription' },
  { id: 'F2', name: 'Mensuel Complet', description: '2 repas par jour pendant 30 jours', price: 45000, durationDays: 30, mealsIncluded: 60, rules: '2 repas / jour maximum', kind: 'subscription' },
  { id: 'F3', name: 'Carnet 10 repas', description: '10 repas à consommer librement', price: 12000, durationDays: 60, mealsIncluded: 10, rules: 'Sans limite journalière, valable 60 jours', kind: 'subscription' },
  // Tickets repas = menus composés Miam's (1 repas crédité, valable 7 jours)
  { id: 'T1', name: 'Ticket — Menu Élève (Lun)', description: 'Mini Fataya + Chandwitch Poulet + Jus Naturel', price: 900, durationDays: 7, mealsIncluded: 1, rules: 'Ticket valable 7 jours, 1 repas', kind: 'ticket' },
  { id: 'T2', name: 'Ticket — Menu Gourmand (Mar)', description: 'Tacos + Boisson Gazeuse + Cake', price: 2200, durationDays: 7, mealsIncluded: 1, rules: 'Ticket valable 7 jours, 1 repas', kind: 'ticket' },
  { id: 'T3', name: 'Ticket — Menu Petit Budget (Mer)', description: 'Mini Pizza + Eau + Mini Cake', price: 400, durationDays: 7, mealsIncluded: 1, rules: 'Ticket valable 7 jours, 1 repas', kind: 'ticket' },
  { id: 'T4', name: 'Ticket — Menu Goûter (Jeu)', description: 'Crépe Sucré + Lakh', price: 600, durationDays: 7, mealsIncluded: 1, rules: 'Ticket valable 7 jours, 1 repas', kind: 'ticket' },
  { id: 'T5', name: 'Ticket — Menu Burger (Ven)', description: 'Burger + Nems + Jus Naturel', price: 1650, durationDays: 7, mealsIncluded: 1, rules: 'Ticket valable 7 jours, 1 repas', kind: 'ticket' },
];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface RestoContextType {
  establishments: Establishment[];
  formulas: Formula[];
  subscriptions: Subscription[];
  payments: ORestoPayment[];
  validations: MealValidation[];
  addEstablishment: (e: Omit<Establishment, 'id'>) => void;
  deleteEstablishment: (id: string) => void;
  addFormula: (f: Omit<Formula, 'id'>) => void;
  updateFormula: (id: string, updates: Partial<Formula>) => void;
  deleteFormula: (id: string) => void;
  mySubscription: (username: string) => Subscription | undefined;
  mySubscriptions: (username: string) => Subscription[];
  myPayments: (username: string) => ORestoPayment[];
  myValidations: (username: string) => MealValidation[];
  // Réserve une formule : crée un abonnement "en attente de paiement" (sans paiement)
  subscribe: (clientUsername: string, formulaId: string) => Subscription;
  // Paie un abonnement en attente.
  // - Espèces : reste en attente jusqu'à encaissement au comptoir (Gérant).
  // - Wave : crée une demande de paiement mobile (pending) ;
  //   l'abonnement s'active à la confirmation du code à 6 chiffres.
  paySubscription: (
    subscriptionId: string,
    method: ORestoPaymentMethod,
  ) => { payment: ORestoPayment; activated: boolean; wave?: WavePaymentRequest };
  // Client : confirme son paiement mobile avec le code à 6 chiffres →
  // paiement soldé + abonnement activé (ou repas ticket crédités).
  confirmMobilePayment: (paymentId: string, code: string) => { ok: boolean; message: string };
  // Client : reprend un paiement mobile en attente (renvoie les instructions + nouveau code).
  resumeMobilePayment: (paymentId: string) => WavePaymentRequest | null;
  // Staff : confirme un paiement espèces → active l'abonnement lié
  confirmCashPayment: (paymentId: string) => boolean;
  // Annule un abonnement en attente (et son paiement en attente)
  cancelSubscription: (subscriptionId: string) => void;
  // Renouvelle : même règles que paySubscription (mobile = code à confirmer).
  renewSubscription: (
    subscriptionId: string,
    method: ORestoPaymentMethod,
  ) => { payment: ORestoPayment; wave?: WavePaymentRequest } | null;
  // Achat d'un ticket repas : espèces = crédit immédiat après enregistrement ;
  // Wave/OM = demande mobile à confirmer (repas crédités à la confirmation).
  buyTicket: (
    clientUsername: string,
    formulaId: string,
    method: ORestoPaymentMethod,
  ) => { payment: ORestoPayment; addedMeals: number; wave?: WavePaymentRequest };
  // Vente au comptoir (Gérant) : formules + tickets pour un client nommé.
  // - Espèces : activation / crédit immédiats + reçu imprimable.
  // - Wave : demande mobile en attente, le client confirme avec son code.
  counterSale: (
    clientUsername: string,
    formulaId: string,
    method: ORestoPaymentMethod,
  ) => { payment: ORestoPayment; wave?: WavePaymentRequest; activated: boolean; addedMeals: number };
  validateMeal: (qrToken: string, establishmentId: string) => { ok: boolean; message: string; validation: MealValidation | null };
  stats: { activeClients: number; mealsToday: number; revenue: number };
}

const RestoContext = createContext<RestoContextType | undefined>(undefined);

export function RestoProvider({ children }: { children: ReactNode }) {
  const [establishments, setEstablishments] = useState<Establishment[]>(() =>
    load(LS_KEYS.establishments, DEFAULT_ESTABLISHMENTS),
  );
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() =>
    load<Subscription[]>(LS_KEYS.subscriptions, [
      {
        id: 'S-DEMO-CLIENT',
        clientUsername: 'client',
        formulaId: 'F1',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: 'active',
        mealsRemaining: 4,
        qrToken: getClientQrToken('client'),
      },
    ]),
  );
  const [formulas, setFormulas] = useState<Formula[]>(() => load(LS_KEYS.formulas, DEFAULT_FORMULAS));
  const [payments, setPayments] = useState<ORestoPayment[]>(() => load(LS_KEYS.payments, []));
  const [validations, setValidations] = useState<MealValidation[]>(() => load(LS_KEYS.validations, []));

  useEffect(() => save(LS_KEYS.establishments, establishments), [establishments]);
  useEffect(() => save(LS_KEYS.formulas, formulas), [formulas]);
  useEffect(() => save(LS_KEYS.subscriptions, subscriptions), [subscriptions]);
  useEffect(() => save(LS_KEYS.payments, payments), [payments]);
  useEffect(() => save(LS_KEYS.validations, validations), [validations]);

  // Synchronisation best-effort vers Supabase (tables créées par supabase-oresto-migration.sql)
  useEffect(() => {
    (async () => {
      try {
        await supabase.from('establishments').upsert(
          establishments.map((e) => ({ id: e.id, name: e.name, address: e.address ?? null, manager: e.manager ?? null, phone: e.phone ?? null })),
        );
      } catch {
        /* offline ou tables non migrées : le localStorage reste la source de vérité */
      }
    })();
  }, [establishments]);

  const mySubscription = useCallback(
    (username: string) => subscriptions.find((s) => s.clientUsername === username && s.status === 'active'),
    [subscriptions],
  );

  const mySubscriptions = useCallback(
    (username: string) => subscriptions.filter((s) => s.clientUsername === username),
    [subscriptions],
  );

  const myPayments = useCallback(
    (username: string) => {
      const ids = new Set(subscriptions.filter((s) => s.clientUsername === username).map((s) => s.id));
      return payments.filter((p) => p.subscriptionId && ids.has(p.subscriptionId));
    },
    [subscriptions, payments],
  );

  const myValidations = useCallback(
    (username: string) => validations.filter((v) => v.clientUsername === username),
    [validations],
  );

  // Réserve une formule : crée un abonnement "en attente" lié au QR personnel du client
  const subscribe = useCallback(
    (clientUsername: string, formulaId: string) => {
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) throw new Error('Formule inconnue');
      const now = new Date();
      const subscription: Subscription = {
        id: uid('S'),
        clientUsername,
        formulaId,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + formula.durationDays * 86400000).toISOString(),
        status: 'pending',
        mealsRemaining: formula.mealsIncluded,
        qrToken: getClientQrToken(clientUsername),
      };
      setSubscriptions((prev) => [...prev, subscription]);
      supabase.from('subscriptions').insert({
        id: subscription.id,
        client_username: subscription.clientUsername,
        formula_id: subscription.formulaId,
        start_date: subscription.startDate,
        end_date: subscription.endDate,
        status: subscription.status,
        meals_remaining: subscription.mealsRemaining,
        qr_token: subscription.qrToken,
      }).then(() => undefined, () => undefined);
      return subscription;
    },
    [formulas],
  );

  // Activation interne : démarre la période maintenant, solde plein, expire l'ancien actif
  const activateSubscription = useCallback(
    (subscriptionId: string) => {
      const target = subscriptions.find((s) => s.id === subscriptionId);
      if (!target) return;
      const formula = formulas.find((f) => f.id === target.formulaId);
      if (!formula) return;
      const now = new Date();
      setSubscriptions((prev) =>
        prev.map((s) => {
          if (s.id === subscriptionId) {
            return {
              ...s,
              status: 'active' as const,
              mealsRemaining: formula.mealsIncluded,
              startDate: now.toISOString(),
              endDate: new Date(now.getTime() + formula.durationDays * 86400000).toISOString(),
            };
          }
          if (s.clientUsername === target.clientUsername && s.status === 'active') {
            return { ...s, status: 'expired' as const };
          }
          return s;
        }),
      );
      supabase.from('subscriptions').update({
        status: 'active',
        meals_remaining: formula.mealsIncluded,
        start_date: now.toISOString(),
        end_date: new Date(now.getTime() + formula.durationDays * 86400000).toISOString(),
      }).eq('id', subscriptionId).then(() => undefined, () => undefined);
    },
    [formulas, subscriptions],
  );

  // Paiement d'un abonnement en attente.
  // Espèces → pending (encaissement au comptoir par le Gérant).
  // Wave → demande mobile pending + code à 6 chiffres à confirmer.
  const paySubscription = useCallback(
    (subscriptionId: string, method: ORestoPaymentMethod) => {
      const sub = subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) throw new Error('Abonnement introuvable');
      const formula = formulas.find((f) => f.id === sub.formulaId);
      if (!formula) throw new Error('Formule inconnue');
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId: sub.id,
        amount: formula.price,
        method,
        status: 'pending',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
      }).then(() => undefined, () => undefined);
      if (!isMobileMethod(method)) return { payment, activated: false };
      const wave = initiateWavePayment(formula.price, method, reference);
      return { payment, activated: false, wave };
    },
    [formulas, subscriptions],
  );

  // Crédite les repas d'un ticket (abonnement actif existant ou mini-abonnement ticket)
  const creditTicketMeals = useCallback(
    (clientUsername: string, formulaId: string): { added: number; subscriptionId: string | undefined } => {
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) return { added: 0, subscriptionId: undefined };
      const now = new Date();
      const existing = subscriptions.find((s) => s.clientUsername === clientUsername && s.status === 'active');
      if (existing) {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === existing.id ? { ...s, mealsRemaining: s.mealsRemaining + formula.mealsIncluded } : s)),
        );
        supabase.from('subscriptions').update({
          meals_remaining: existing.mealsRemaining + formula.mealsIncluded,
        }).eq('id', existing.id).then(() => undefined, () => undefined);
        return { added: formula.mealsIncluded, subscriptionId: existing.id };
      }
      const ticket: Subscription = {
        id: uid('S'),
        clientUsername,
        formulaId,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + formula.durationDays * 86400000).toISOString(),
        status: 'active',
        mealsRemaining: formula.mealsIncluded,
        qrToken: getClientQrToken(clientUsername),
      };
      setSubscriptions((prev) => [...prev, ticket]);
      supabase.from('subscriptions').insert({
        id: ticket.id,
        client_username: ticket.clientUsername,
        formula_id: ticket.formulaId,
        start_date: ticket.startDate,
        end_date: ticket.endDate,
        status: ticket.status,
        meals_remaining: ticket.mealsRemaining,
        qr_token: ticket.qrToken,
      }).then(() => undefined, () => undefined);
      return { added: formula.mealsIncluded, subscriptionId: ticket.id };
    },
    [formulas, subscriptions],
  );

  // Client : reprend un paiement mobile en attente (instructions + code actualisés).
  const resumeMobilePayment = useCallback(
    (paymentId: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment || payment.status !== 'pending' || !isMobileMethod(payment.method)) return null;
      return initiateWavePayment(payment.amount, payment.method, payment.reference);
    },
    [payments],
  );

  // Client : confirme son paiement mobile (Wave) avec le code à 6 chiffres.
  const confirmMobilePayment = useCallback(
    (paymentId: string, code: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment) return { ok: false, message: 'Paiement introuvable.' };
      if (payment.status === 'paid') return { ok: true, message: 'Paiement déjà confirmé.' };
      if (payment.status !== 'pending') return { ok: false, message: 'Ce paiement ne peut plus être confirmé.' };
      if (!isMobileMethod(payment.method)) {
        return { ok: false, message: 'Les paiements espèces se confirment au comptoir.' };
      }
      if (!checkWaveCode(payment.reference, code)) {
        return { ok: false, message: 'Code incorrect : vérifiez le code à 6 chiffres reçu après votre envoi.' };
      }
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId).then(() => undefined, () => undefined);
      clearWaveCode(payment.reference);
      // Intention ticket en attente ? → créditer les repas au lieu d'activer un abonnement
      const intents = load<Record<string, { username: string; formulaId: string }>>(LS_KEYS.ticketIntents, {});
      const intent = intents[paymentId];
      if (intent) {
        const { added } = creditTicketMeals(intent.username, intent.formulaId);
        const next = { ...intents };
        delete next[paymentId];
        save(LS_KEYS.ticketIntents, next);
        return { ok: true, message: `Paiement confirmé : ${added} repas crédité(s). Présentez votre QR Code.` };
      }
      if (payment.subscriptionId) activateSubscription(payment.subscriptionId);
      return { ok: true, message: 'Paiement confirmé : votre carte est ACTIVE. Présentez votre QR Code.' };
    },
    [payments, activateSubscription, creditTicketMeals],
  );

  // Staff : encaisse les espèces → paiement soldé + abonnement activé.
  // Refuse les paiements mobiles (ils se confirment avec le code du client).
  const confirmCashPayment = useCallback(
    (paymentId: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment || payment.status !== 'pending' || !payment.subscriptionId) return false;
      if (isMobileMethod(payment.method)) return false;
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId).then(() => undefined, () => undefined);
      activateSubscription(payment.subscriptionId);
      return true;
    },
    [payments, activateSubscription],
  );

  // Annulation d'une réservation en attente (+ son paiement en attente)
  const cancelSubscription = useCallback(
    (subscriptionId: string) => {
      setSubscriptions((prev) => prev.map((s) => (s.id === subscriptionId && s.status === 'pending' ? { ...s, status: 'cancelled' as const } : s)));
      setPayments((prev) => prev.map((p) => (p.subscriptionId === subscriptionId && p.status === 'pending' ? { ...p, status: 'cancelled' as const } : p)));
      supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', subscriptionId).then(() => undefined, () => undefined);
    },
    [],
  );

  const renewSubscription = useCallback(    (subscriptionId: string, method: ORestoPaymentMethod) => {
      const sub = subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) return null;
      const formula = formulas.find((f) => f.id === sub.formulaId);
      if (!formula) return null;
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId: sub.id,
        amount: formula.price,
        method,
        status: 'pending',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
      }).then(() => undefined, () => undefined);
      // Espèces : le Gérant encaisse au comptoir (Abonnés & paiements).
      // Mobile : le client confirme avec son code à 6 chiffres.
      if (!isMobileMethod(method)) return { payment };
      const wave = initiateWavePayment(formula.price, method, reference);
      return { payment, wave };
    },
    [subscriptions, formulas],
  );

  // Achat d'un ticket repas (menu de la semaine) : crédite des repas SANS résilier
  // l'abonnement actif ; crée un mini-abonnement ticket s'il n'y en a aucun.
  // Espèces → crédit immédiat (vente comptoir). Wave/OM → pending à confirmer.
  const buyTicket = useCallback(
    (clientUsername: string, formulaId: string, method: ORestoPaymentMethod) => {
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) throw new Error('Formule inconnue');
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      if (isMobileMethod(method)) {
        const payment: ORestoPayment = {
          id: uid('P'),
          amount: formula.price,
          method,
          status: 'pending',
          reference,
          createdAt: now.toISOString(),
        };
        setPayments((prev) => [...prev, payment]);
        supabase.from('oresto_payments').insert({
          id: payment.id,
          subscription_id: null,
          amount: payment.amount,
          method: payment.method,
          status: payment.status,
          reference: payment.reference,
        }).then(() => undefined, () => undefined);
        const intents = load<Record<string, { username: string; formulaId: string }>>(LS_KEYS.ticketIntents, {});
        save(LS_KEYS.ticketIntents, { ...intents, [payment.id]: { username: clientUsername, formulaId } });
        const wave = initiateWavePayment(formula.price, method, reference);
        return { payment, addedMeals: 0, wave };
      }
      const { added: addedMeals, subscriptionId } = creditTicketMeals(clientUsername, formulaId);
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId,
        amount: formula.price,
        method,
        status: 'paid',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
      }).then(() => undefined, () => undefined);
      return { payment, addedMeals };
    },
    [formulas, creditTicketMeals],
  );

  // Vente au comptoir par le Gérant : ticket ou abonnement pour un client nommé.
  const counterSale = useCallback(
    (clientUsername: string, formulaId: string, method: ORestoPaymentMethod) => {
      const name = clientUsername.trim().toLowerCase();
      if (!name) throw new Error('Nom du client requis');
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) throw new Error('Formule inconnue');
      if (formula.kind === 'ticket') {
        const result = buyTicket(name, formulaId, method);
        return { ...result, activated: method === 'cash' };
      }
      const pending = subscriptions.find(
        (s) => s.clientUsername === name && s.formulaId === formulaId && s.status === 'pending',
      );
      const sub = pending ?? subscribe(name, formulaId);
      const { payment, wave } = paySubscription(sub.id, method);
      if (method === 'cash') {
        confirmCashPayment(payment.id); // encaissé au comptoir → carte active aussitôt
        return { payment: { ...payment, status: 'paid' as const }, addedMeals: formula.mealsIncluded, activated: true };
      }
      return { payment, wave, addedMeals: 0, activated: false };
    },
    [formulas, subscriptions, subscribe, paySubscription, confirmCashPayment, buyTicket],
  );

  const validateMeal = useCallback(
    (qrToken: string, establishmentId: string) => {
      const token = qrToken.trim().toUpperCase();
      const now = new Date();
      const fail = (message: string, clientUsername = 'inconnu'): { ok: boolean; message: string; validation: MealValidation | null } => {
        const validation: MealValidation = {
          id: uid('V'),
          qrToken: token,
          clientUsername,
          establishmentId,
          validatedAt: now.toISOString(),
          status: 'rejected',
          reason: message,
        };
        setValidations((prev) => [...prev, validation]);
        return { ok: false, message, validation };
      };

      // QR acceptés : token exact de l'abonnement OU QR personnel stable du client
      // (anciennes cartes gardées valides, nouvelles cartes liées au QR personnel).
      const sub = subscriptions.find((s) => s.qrToken.toUpperCase() === token)
        ?? subscriptions
          .filter((s) => isPersonalQrToken(s.clientUsername, token))
          .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))[0];
      if (!sub) return fail('QR Code inconnu : aucun abonnement associé.');
      if (sub.status !== 'active') return fail('Abonnement inactif ou expiré.', sub.clientUsername);
      if (new Date(sub.endDate).getTime() < now.getTime()) {
        setSubscriptions((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status: 'expired' as const } : s)));
        return fail('Abonnement expiré.', sub.clientUsername);
      }
      if (sub.mealsRemaining <= 0) return fail('Plus de repas disponibles sur cet abonnement.', sub.clientUsername);
      const alreadyToday = validations.some(
        (v) => v.qrToken.toUpperCase() === token && v.status === 'accepted' && sameDay(new Date(v.validatedAt), now),
      );
      if (alreadyToday) return fail('Double validation : un repas a déjà été validé aujourd’hui avec ce QR Code.', sub.clientUsername);

      const validation: MealValidation = {
        id: uid('V'),
        qrToken: token,
        clientUsername: sub.clientUsername,
        establishmentId,
        validatedAt: now.toISOString(),
        status: 'accepted',
      };
      setValidations((prev) => [...prev, validation]);
      setSubscriptions((prev) => prev.map((s) => (s.id === sub.id ? { ...s, mealsRemaining: s.mealsRemaining - 1 } : s)));
      supabase.from('validations').insert({
        id: validation.id,
        qr_token: validation.qrToken,
        client_username: validation.clientUsername,
        establishment_id: validation.establishmentId,
        status: validation.status,
        reason: validation.reason ?? null,
      }).then(() => undefined, () => undefined);
      return { ok: true, message: `Repas validé pour ${sub.clientUsername}. Repas restants : ${sub.mealsRemaining - 1}.`, validation };
    },
    [subscriptions, validations],
  );

  const addEstablishment = useCallback((e: Omit<Establishment, 'id'>) => {
    setEstablishments((prev) => [...prev, { ...e, id: uid('E') }]);
  }, []);

  const deleteEstablishment = useCallback((id: string) => {
    setEstablishments((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addFormula = useCallback((f: Omit<Formula, 'id'>) => {
    const formula: Formula = { ...f, id: uid('F') };
    setFormulas((prev) => [...prev, formula]);
    supabase.from('formulas').insert({
      id: formula.id,
      name: formula.name,
      description: formula.description,
      price: formula.price,
      duration_days: formula.durationDays,
      meals_included: formula.mealsIncluded,
      rules: formula.rules ?? null,
    }).then(() => undefined, () => undefined);
  }, []);

  const updateFormula = useCallback((id: string, updates: Partial<Formula>) => {
    setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const deleteFormula = useCallback((id: string) => {
    setFormulas((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const stats = {
    activeClients: subscriptions.filter((s) => s.status === 'active').length,
    mealsToday: validations.filter((v) => v.status === 'accepted' && sameDay(new Date(v.validatedAt), new Date())).length,
    revenue: payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
  };

  return (
    <RestoContext.Provider
      value={{
        establishments,
        formulas,
        subscriptions,
        payments,
        validations,
        addEstablishment,
        deleteEstablishment,
        addFormula,
        updateFormula,
        deleteFormula,
        mySubscription,
        mySubscriptions,
        myPayments,
        myValidations,
        subscribe,
        paySubscription,
        confirmMobilePayment,
        resumeMobilePayment,
        confirmCashPayment,
        cancelSubscription,
        renewSubscription,
        buyTicket,
        counterSale,
        validateMeal,
        stats,
      }}
    >
      {children}
    </RestoContext.Provider>
  );
}

export function useResto() {
  const ctx = useContext(RestoContext);
  if (!ctx) throw new Error('useResto must be used within a RestoProvider');
  return ctx;
}
