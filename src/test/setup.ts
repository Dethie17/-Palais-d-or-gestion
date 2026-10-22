import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

// Les tests ne touchent JAMAIS au Supabase distant : la synchro est
// best-effort en production, les assertions portent sur l'état local.
// Ce mock neutralise tous les appels (insert/update/select/…) en no-op.
vi.mock("@/lib/supabase", () => {
  // Une session « serveur » : c'est elle que le contexte traduit en profil.
  // Avant le durcissement, les tests se connectaient en écrivant
  // `o-resto-current-user` dans localStorage — c'est-à-dire en simulant
  // exactement l'attaque que la migration cherche à interdire. On passe donc
  // par le vrai chemin : jeton, puis lecture du profil.
  const TEST_AUTH_UID = "00000000-0000-4000-8000-000000000001";
  const TEST_SESSION = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: TEST_AUTH_UID, aud: "authenticated", email: "client@oresto-sn.com" },
  };
  // Rôle du compte de test : la ligne `users` que le RLS lui rendrait.
  const TEST_PROFILE = {
    username: "client",
    role: "client",
    establishment_id: null,
    auth_id: TEST_AUTH_UID,
  };

  const terminal = { data: null, error: null };

  /**
   * Chaîne PostgREST simulée.
   *
   * L'état est partagé d'un maillon à l'autre : `from().select('…')` doit
   * rester visible après `.eq().maybeSingle()`. Une copie à chaque maillon
   * ferait perdre la projection, et la lecture de profil retomberait sur
   * « aucune donnée » — donc sur une session sans utilisateur.
   */
  const makeChain = (table?: string, state: { columns?: string } = {}): Record<string, unknown> => {
    const resolve = (cb?: (v: unknown) => unknown) => {
      const isProfileRead =
        table === "users" && typeof state.columns === "string" && state.columns.includes("username");
      return Promise.resolve(isProfileRead ? { data: TEST_PROFILE, error: null } : terminal).then(
        cb as never,
      );
    };

    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return resolve;
          if (prop === "data" || prop === "error") return null;
          if (prop === "select") return (cols?: string) => ((state.columns = cols), makeChain(table, state));
          if (typeof prop === "string" && prop !== "then") return () => makeChain(table, state);
          return undefined;
        },
      },
    );
  };

  return {
    // En test la synchro distante reste active côté code (rescannote
    // périodique) mais ne vise aucun projet réel : les appels sont no-op.
    isSupabaseConfigured: true,
    supabase: {
      from: (table: string) => makeChain(table),
      // La passerelle SycaPay passe par des fonctions SQL (règlement,
      // traçage de transaction) : même contrat no-op en test.
      rpc: () => makeChain(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: TEST_SESSION }, error: null }),
        signInWithPassword: () =>
          Promise.resolve({ data: { session: TEST_SESSION }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        updateUser: () => Promise.resolve({ data: { user: TEST_SESSION.user }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/**
 * JSDOM ne sait pas lire un Blob en mémoire (`Blob.arrayBuffer`), alors que
 * tous les navigateurs supports le font depuis 2019. La lecture Excel
 * (`read-excel-file`) passe par là : sans ce polyfill, les tests d'import
 * échouent sur un fichier parfaitement valide.
 */
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

/**
 * ISOLATION — chaque test repart d'une base vide.
 *
 * L'application persiste son état (enfants, abonnements, fiches parent) dans
 * localStorage. Sans nettoyage, le test suivant inheritait de la famille du
 * test précédent : c'est ce qui faisait échouer des tests corrects (un
 * parent déjà connu, un enfant déjà inscrit).
 */
beforeEach(() => {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* stockage indisponible : rien à nettoyer */
  }
});
