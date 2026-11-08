const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const vars = {}; env.split(/\n/).forEach(l => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) vars[m[1].trim()] = m[2].trim(); });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { error } = await db.from('users').update({ role: 'rh' }).eq('username', 'rh-dangote');
  console.log(error ? error.message : 'updated rh-dangote to rh');
})();