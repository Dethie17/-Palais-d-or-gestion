const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
function legacyPasswordHash(password) { return `sha256-${crypto.createHash('sha256').update(`o-resto$${password}`).digest('hex')}`; }
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const vars = {};
env.split(/\n/).forEach((l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) vars[m[1].trim()] = m[2].trim(); });
const url = vars.SUPABASE_URL;
const key = vars.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key);

(async () => {
  const { data: ent } = await db.from('entites').select('id').eq('slug', 'dangote').single();
  console.log('entity', ent);
  const entiteId = ent.id;

  const accounts = [
    { u: 'dch', r: 'dch', email: 'dch@dangote.oresto-sn.com' },
    { u: 'rh-dangote', r: 'admin', email: 'rh-dangote@dangote.oresto-sn.com' },
    { u: 'superviseur-dangote', r: 'personnel', email: 'superviseur-dangote@dangote.oresto-sn.com' },
  ];
  for (const a of accounts) {
    const { data: created, error: createErr } = await db.auth.admin.createUser({ email: a.email, password: 'Dangote123!', email_confirm: true });
    if (createErr) { console.error('auth error', a.u, createErr.message); continue; }
    const authId = created.user.id;
    const { error: profErr } = await db.from('users').insert({
      username: a.u,
      role: a.r,
      auth_id: authId,
      qr_token: `qr-${a.u}`,
      entite_id: entiteId,
      password: legacyPasswordHash('Dangote123!'),
    });
    if (profErr) console.error('profile error', a.u, profErr.message);
    else console.log('created', a.u);
  }
})();