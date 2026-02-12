import { Product } from '@/types/menu';

// VRAIS PRODUITS DU MENU MIAM STREETFOOD
// Ces produits servent à initialiser la base de données Supabase si elle est vide
export const categories = ['Tous', 'Tacos', 'Sandwichs', 'Burgers', 'Fataya', 'Crépes', 'Pizza', 'Accompagnements', 'Boissons', 'Desserts'];

export const categoryIcons: Record<string, string> = {
  'Tous': 'restaurant_menu',
  'Tacos': 'lunch_dining',
  'Sandwichs': 'fastfood',
  'Burgers': 'lunch_dining',
  'Fataya': 'bakery_dining',
  'Crépes': 'breakfast_dining',
  'Pizza': 'local_pizza',
  'Accompagnements': 'tapas',
  'Boissons': 'local_cafe',
  'Desserts': 'cake',
};

// Liste complète des produits (21 produits)
export const mockProducts: Product[] = [
  // TACOS
  { id: 'M01', name: 'Mini Tacos', category: 'Tacos', price: 500, description: 'Délicieux mini tacos croustillants', image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=300&h=300&fit=crop', available: true },
  { id: 'M02', name: 'Tacos', category: 'Tacos', price: 1500, description: 'Tacos généreux garni à votre goût', image: '/images/products/tacos.jfif', available: true },
  
  // SANDWICHS
  { id: 'M06', name: 'Chandwitch Poulet', category: 'Sandwichs', price: 500, description: 'Sandwich chaud au poulet tendre', image: 'https://images.unsplash.com/photo-1619096252214-ef06c45683e3?w=300&h=300&fit=crop', available: true },
  { id: 'M07', name: 'Chandwitch Viande', category: 'Sandwichs', price: 500, description: 'Sandwich chaud à la viande savoureuse', image: 'https://images.unsplash.com/photo-1567234669003-dce7a7a88821?w=300&h=300&fit=crop', available: true },
  { id: 'M20', name: 'Pain Omlette', category: 'Sandwichs', price: 500, description: 'Pain garni d\'omelette moelleuse', image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=300&h=300&fit=crop', available: true },
  
  // BURGERS
  { id: 'M08', name: 'Burger', category: 'Burgers', price: 1200, description: 'Burger gourmand avec garniture complète', image: '/images/products/burger.jfif', available: true },
  { id: 'M09', name: 'Mini Burger', category: 'Burgers', price: 300, description: 'Mini burger parfait pour petite faim', image: '/images/products/mini burger.jfif', available: true },
  
  // FATAYA
  { id: 'M03', name: 'Fataya Complet', category: 'Fataya', price: 600, description: 'Fataya garni, croustillant et savoureux', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300&h=300&fit=crop', available: true },
  { id: 'M10', name: 'Mini Fataya', category: 'Fataya', price: 100, description: 'Petit fataya croustillant', image: 'https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=300&h=300&fit=crop', available: true },
  
  // CRÉPES
  { id: 'M04', name: 'Crépe Salé', category: 'Crépes', price: 500, description: 'Crépe salée garnie selon vos goûts', image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=300&h=300&fit=crop', available: true },
  { id: 'M05', name: 'Crépe Sucré', category: 'Crépes', price: 300, description: 'Crépe sucrée pour les gourmands', image: '/images/products/crepe sucré.jfif', available: true },
  
  // PIZZA
  { id: 'M19', name: 'Mini Pizza', category: 'Pizza', price: 200, description: 'Mini pizza savoureuse', image: '/images/products/mini pizza.jfif', available: true },
  
  // ACCOMPAGNEMENTS
  { id: 'M11', name: 'Fondé', category: 'Accompagnements', price: 250, description: 'Accompagnement traditionnel fondant', image: 'https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=300&h=300&fit=crop', available: true },
  { id: 'M18', name: 'Nems', category: 'Accompagnements', price: 150, description: 'Nems croustillants et savoureux', image: '/images/products/Nems.jfif', available: true },
  
  // BOISSONS
  { id: 'M12', name: 'Lakh', category: 'Boissons', price: 300, description: 'Boisson rafraîchissante traditionnelle', image: 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=300&h=300&fit=crop', available: true },
  { id: 'M13', name: 'Boisson Gazeuse', category: 'Boissons', price: 400, description: 'Boisson gazeuse fraîche', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=300&h=300&fit=crop', available: true },
  { id: 'M14', name: 'Jus Naturel', category: 'Boissons', price: 300, description: 'Jus de fruits frais 100% naturel', image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=300&h=300&fit=crop', available: true },
  { id: 'M21', name: 'Eau', category: 'Boissons', price: 150, description: 'Eau minérale fraîche', image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=300&h=300&fit=crop', available: true },
  
  // DESSERTS
  { id: 'M15', name: 'Mini Cake', category: 'Desserts', price: 50, description: 'Petit gâteau moelleux', image: '/images/products/mini cake.jfif', available: true },
  { id: 'M16', name: 'Cake', category: 'Desserts', price: 300, description: 'Gâteau moelleux et savoureux', image: '/images/products/cake.jfif', available: true },
  { id: 'M17', name: 'Pain Au Lait', category: 'Desserts', price: 150, description: 'Pain au lait moelleux et doux', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&h=300&fit=crop', available: true },
];

// Les commandes et statistiques viennent de votre base de données Supabase
// Plus besoin de données mockées !
