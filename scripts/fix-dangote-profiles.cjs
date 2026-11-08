const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const vars = {}; env.split(/\n/).forEach(l => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) vars[m[1].trim()] = m[2].trim(); });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
function legacyPasswordHash(password) { return `sha256-${crypto.createHash('sha256').update(`o-resto$${password}`).digest('hex')}`; }
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: ent } = await db.from('entites').select('id').eq('slug', 'dangote').single();
  const entiteId = ent.id;
  const { data: list } = await db.auth.admin.listUsers();
  const accounts = [
    { u: 'dch', r: 'dch', email: 'dch@dangote.oresto-sn.com' },
    { u: 'rh-dangote', r: 'admin', email: 'rh-dangote@dangote.oresto-sn.com' },
    { u: 'superviseur-dangote', r: 'personnel', email: 'superviseur-dangote@dangote.oresto-sn.com' },
  ];
  for (const a of accounts) {
    const user = list.users.find((x) => x.email === a.email);
    if (!user) { console.log('no auth user', a.u); continue; }
    const { error } = await db.from('users').insert({
      username: a.u,
      role: a.r,
      auth_id: user.id,
      qr_token: `qr-${a.u}`,
      entite_id: entiteId,
      password: legacyPasswordHash('Dangote123!'),
    });
    if (error) console.error('profile error', a.u, error.message);
    else console.log('profile created', a.u);
  }
})();