CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('caissier', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO users (username, password, role) VALUES
  ('caissier', 'caissier123', 'caissier'),
  ('manager', 'manager123', 'manager')
ON CONFLICT (username) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  items JSONB NOT NULL,
  extras JSONB,
  subtotal NUMERIC NOT NULL,
  tax NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  type TEXT NOT NULL CHECK (type IN ('dine-in', 'takeaway')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_name TEXT,
  payment_method TEXT,
  amount_received NUMERIC,
  change NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC NOT NULL,
  description TEXT,
  image TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  extras JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique des utilisateurs" ON users;
CREATE POLICY "Lecture publique des utilisateurs" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Mise à jour publique des utilisateurs" ON users;
CREATE POLICY "Mise à jour publique des utilisateurs" ON users FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Lecture publique des commandes" ON orders;
CREATE POLICY "Lecture publique des commandes" ON orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Création publique des commandes" ON orders;
CREATE POLICY "Création publique des commandes" ON orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Mise à jour publique des commandes" ON orders;
CREATE POLICY "Mise à jour publique des commandes" ON orders FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Suppression publique des commandes" ON orders;
CREATE POLICY "Suppression publique des commandes" ON orders FOR DELETE USING (true);

DROP POLICY IF EXISTS "Lecture publique des produits" ON products;
CREATE POLICY "Lecture publique des produits" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Création publique des produits" ON products;
CREATE POLICY "Création publique des produits" ON products FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Mise à jour publique des produits" ON products;
CREATE POLICY "Mise à jour publique des produits" ON products FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Suppression publique des produits" ON products;
CREATE POLICY "Suppression publique des produits" ON products FOR DELETE USING (true);
