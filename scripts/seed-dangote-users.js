const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key);

(async () => {
  // find Dangote entity
  const { data: ent } = await db.from('entites').select('id').eq('slug', 'dangote').single();
  console.log('entity', ent);
  const entiteId = ent.id;

  // create auth user
  const email = 'dch@dangote.oresto-sn.com';
  const password = 'Dangote123!';
  const { data: created, error: createErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr) { console.error('create auth error', createErr); return; }
  const authId = created.user.id;
  console.log('auth id', authId);

  // insert profile
  const { error: profErr } = await db.from('users').insert({
    username: 'dch',
    role: 'dch',
    auth_id: authId,
    qr_token: 'qr-dch',
    entite_id: entiteId,
  });
  if (profErr) console.error('profile error', profErr);
  else console.log('profile created');

  // also create a supervisor and rh
  for (const [u, r] of [['superviseur-dangote','personnel'], ['rh-dangote','admin']]) {
    const { data: c } = await db.auth.admin.createUser({ email: `${u}@dangote.oresto-sn.com`, password: 'Dangote123!', email_confirm: true });
    if (c?.user) {
      await db.from('users').insert({ username: u, role: r, auth_id: c.user.id, qr_token: `qr-${u}`, entite_id: entiteId });
      console.log('created', u);
    }
  }
})();
EOF