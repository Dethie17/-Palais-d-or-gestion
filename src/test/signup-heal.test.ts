import { describe, it, expect } from 'vitest';
import { healMissingClientProfile } from '@/context/AuthContext';

/**
 * Un parent dont le compte Auth existe mais sans fiche métier (inscription
 * interrompue, confirmation tardive) ne doit jamais rester coincé : la
 * connexion recrée sa fiche client — jamais plus (aucune élévation).
 */

function fakeClient(error: { code?: string; message?: string } | null = null) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        calls.push(row);
        return { error };
      },
    }),
  };
}

const sessionFor = (email: string, managed?: 'parent' | 'staff') =>
  ({
    user: { id: 'auth-uuid-1', email, app_metadata: managed ? { oresto: managed } : {} },
  }) as never;

describe('Réparation inscription parent interrompue', () => {
  it('recrée la fiche client manquante et connecte', async () => {
    const client = fakeClient();
    const user = await healMissingClientProfile(client, sessionFor('awa@oresto-sn.com', 'parent'));
    expect(user).toMatchObject({ username: 'awa', role: 'client' });
    expect(user?.qrToken).toBeTruthy();
    expect(client.calls[0]).toMatchObject({ username: 'awa', role: 'client' });
  });

  it('ne répare QUE les comptes créés par O RESTO (marqueur serveur)', async () => {
    // Un compte Auth d'un autre projet pourrait partager le domaine e-mail :
    // sans app_metadata.oresto (posé uniquement avec la clé service), on ne
    // crée aucune fiche client.
    const client = fakeClient();
    expect(await healMissingClientProfile(client, sessionFor('awa@oresto-sn.com'))).toBeNull();
    expect(await healMissingClientProfile(client, sessionFor('awa@oresto-sn.com', 'staff'))).toBeNull();
    expect(client.calls).toHaveLength(0);
  });

  it('refuse les adresses hors domaine sans rien écrire', async () => {
    const client = fakeClient();
    expect(await healMissingClientProfile(client, sessionFor('awa@gmail.com', 'parent'))).toBeNull();
    // L'ancien domaine `.local` (refusé par Supabase) ne passe plus non plus.
    expect(await healMissingClientProfile(client, sessionFor('awa@oresto.local', 'parent'))).toBeNull();
    expect(client.calls).toHaveLength(0);
  });

  it('refuse un nom invalide sans rien écrire', async () => {
    const client = fakeClient();
    expect(await healMissingClientProfile(client, sessionFor('Awa Diallo@oresto-sn.com', 'parent'))).toBeNull();
    expect(client.calls).toHaveLength(0);
  });

  it('ne détourne jamais une fiche existante (conflit = on ne touche à rien)', async () => {
    const client = fakeClient({ code: '23505', message: 'duplicate' });
    expect(await healMissingClientProfile(client, sessionFor('awa@oresto-sn.com', 'parent'))).toBeNull();
  });

  it('reste silencieux en panne de base', async () => {
    const broken = { from: () => ({ insert: async () => { throw new Error('réseau'); } }) };
    expect(await healMissingClientProfile(broken, sessionFor('awa@oresto-sn.com', 'parent'))).toBeNull();
  });
});
