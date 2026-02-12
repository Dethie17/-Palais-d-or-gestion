-- =====================================================
-- INSERTION DES 22 PRODUITS DU MENU MIAM STREETFOOD
-- =====================================================
-- Exécutez ce script dans l'éditeur SQL de Supabase
-- pour insérer tous vos produits dans la base de données

-- Nettoyage (optionnel - décommentez si vous voulez repartir de zéro)
-- DELETE FROM products;

-- TACOS
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M01', 'Mini Tacos', 'Tacos', 500, 'Délicieux mini tacos croustillants', '/images/products/mini tacos.png', true, '[]'::jsonb, NOW(), NOW()),
  ('M02', 'Tacos', 'Tacos', 1500, 'Tacos généreux garni à votre goût', '/images/products/tacos.jfif', true, '[]'::jsonb, NOW(), NOW());

-- SANDWICHS
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M06', 'Chandwitch Poulet', 'Sandwichs', 500, 'Sandwich chaud au poulet tendre', '/images/products/chandwitch poulet.png', true, '[]'::jsonb, NOW(), NOW()),
  ('M07', 'Chandwitch Viande', 'Sandwichs', 500, 'Sandwich chaud à la viande savoureuse', '/images/products/chandwitch viande.png', true, '[]'::jsonb, NOW(), NOW()),
  ('M20', 'Pain Omlette', 'Sandwichs', 500, 'Pain garni d''omelette moelleuse', '/images/products/pain omelette.png', true, '[]'::jsonb, NOW(), NOW());

-- BURGERS
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M08', 'Burger', 'Burgers', 1200, 'Burger gourmand avec garniture complète', '/images/products/burger.jfif', true, '[]'::jsonb, NOW(), NOW()),
  ('M09', 'Mini Burger', 'Burgers', 300, 'Mini burger parfait pour petite faim', '/images/products/mini burger.jfif', true, '[]'::jsonb, NOW(), NOW());

-- FATAYA
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M03', 'Fataya Complet', 'Fataya', 600, 'Fataya garni, croustillant et savoureux', '/images/products/fataya complet.png', true, '[]'::jsonb, NOW(), NOW()),
  ('M10', 'Mini Fataya', 'Fataya', 100, 'Petit fataya croustillant', '/images/products/mini fataya.webp', true, '[]'::jsonb, NOW(), NOW());

-- CRÉPES
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M04', 'Crépe Salé', 'Crépes', 500, 'Crépe salée garnie selon vos goûts', '/images/products/crepes salée.png', true, '[]'::jsonb, NOW(), NOW()),
  ('M05', 'Crépe Sucré', 'Crépes', 300, 'Crépe sucrée pour les gourmands', '/images/products/crepe sucré.jfif', true, '[]'::jsonb, NOW(), NOW());

-- PIZZA
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M19', 'Mini Pizza', 'Pizza', 200, 'Mini pizza savoureuse', '/images/products/mini pizza.jfif', true, '[]'::jsonb, NOW(), NOW()),
  ('M22', 'Pizza', 'Pizza', 1500, 'Pizza généreuse et savoureuse', '/images/products/pizza.jfif', true, '[]'::jsonb, NOW(), NOW());

-- ACCOMPAGNEMENTS
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M11', 'Fondé', 'Accompagnements', 250, 'Accompagnement traditionnel fondant', '/images/products/fondé.jpg', true, '[]'::jsonb, NOW(), NOW()),
  ('M18', 'Nems', 'Accompagnements', 150, 'Nems croustillants et savoureux', '/images/products/Nems.jfif', true, '[]'::jsonb, NOW(), NOW());

-- BOISSONS
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M12', 'Lakh', 'Boissons', 300, 'Boisson rafraîchissante traditionnelle', '/images/products/lakh.jpg', true, '[]'::jsonb, NOW(), NOW()),
  ('M13', 'Boisson Gazeuse', 'Boissons', 400, 'Boisson gazeuse fraîche', '/images/products/boisson gazeuse.webp', true, '[]'::jsonb, NOW(), NOW()),
  ('M14', 'Jus Naturel', 'Boissons', 300, 'Jus de fruits frais 100% naturel', '/images/products/jus naturel.png', true, '[]'::jsonb, NOW(), NOW()),
  ('M21', 'Eau', 'Boissons', 150, 'Eau minérale fraîche', '/images/products/eau.png', true, '[]'::jsonb, NOW(), NOW());

-- DESSERTS
INSERT INTO products (id, name, category, price, description, image, available, extras, created_at, updated_at)
VALUES 
  ('M15', 'Mini Cake', 'Desserts', 50, 'Petit gâteau moelleux', '/images/products/mini cake.jfif', true, '[]'::jsonb, NOW(), NOW()),
  ('M16', 'Cake', 'Desserts', 300, 'Gâteau moelleux et savoureux', '/images/products/cake.jfif', true, '[]'::jsonb, NOW(), NOW()),
  ('M17', 'Pain Au Lait', 'Desserts', 150, 'Pain au lait moelleux et doux', '/images/products/pains-au-lait.webp', true, '[]'::jsonb, NOW(), NOW());

-- Vérification : afficher tous les produits insérés
SELECT id, name, category, price, available 
FROM products 
ORDER BY 
  CASE category
    WHEN 'Tacos' THEN 1
    WHEN 'Sandwichs' THEN 2
    WHEN 'Burgers' THEN 3
    WHEN 'Fataya' THEN 4
    WHEN 'Crépes' THEN 5
    WHEN 'Pizza' THEN 6
    WHEN 'Accompagnements' THEN 7
    WHEN 'Boissons' THEN 8
    WHEN 'Desserts' THEN 9
    ELSE 10
  END,
  name;
