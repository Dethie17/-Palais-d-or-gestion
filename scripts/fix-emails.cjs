const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const vars = {}; env.split(/\n/).forEach(l => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) vars[m[1].trim()] = m[2].trim(); });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: list } = await db.auth.admin.listUsers();
  const accounts = [
    { u: 'dch', old: 'dch@dangote.oresto-sn.com', newEmail: 'dch@oresto-sn.com' },
    { u: 'rh-dangote', old: 'rh-dangote@dangote.oresto-sn.com', newEmail: 'rh-dangote@oresto-sn.com' },
    { u: 'superviseur-dangote', old: 'superviseur-dangote@dangote.oresto-sn.com', newEmail: 'superviseur-dangote@oresto-sn.com' },
  ];
  for (const a of accounts) {
    const user = list.users.find((x) => x.email === a.old);
    if (!user) { console.log('not found', a.u); continue; }
    const { error } = await db.auth.admin.updateUserById(user.id, { email: a.newEmail, email_confirm: true });
    if (error) console.error('update error', a.u, error.message);
    else console.log('updated', a.u, a.newEmail);
  }
})();