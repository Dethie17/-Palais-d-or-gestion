import { Product, Order } from '@/types/menu';

export const categories = ['Tous', 'Burgers', 'Pizzas', 'Boissons', 'Desserts', 'Accompagnements'];

export const categoryIcons: Record<string, string> = {
  'Tous': 'restaurant_menu',
  'Burgers': 'lunch_dining',
  'Pizzas': 'local_pizza',
  'Boissons': 'local_cafe',
  'Desserts': 'cake',
  'Accompagnements': 'tapas',
};

export const mockProducts: Product[] = [
  { id: '1', name: 'Classic Burger', category: 'Burgers', price: 5575, description: 'Boeuf, salade, tomate, oignon, sauce maison', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&h=300&fit=crop', available: true, extras: [{ id: 'e1', name: 'Fromage', price: 655 }, { id: 'e2', name: 'Bacon', price: 985 }] },
  { id: '2', name: 'Cheese Burger', category: 'Burgers', price: 6230, description: 'Boeuf, double cheddar, cornichons, sauce spéciale', image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=300&h=300&fit=crop', available: true },
  { id: '3', name: 'Chicken Burger', category: 'Burgers', price: 5900, description: 'Poulet croustillant, salade, mayo maison', image: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=300&h=300&fit=crop', available: true },
  { id: '4', name: 'Double Smash', category: 'Burgers', price: 7870, description: 'Double steak smashé, cheddar fondu, oignons caramélisés', image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=300&h=300&fit=crop', available: true },
  { id: '5', name: 'Margherita', category: 'Pizzas', price: 6560, description: 'Tomate, mozzarella, basilic frais', image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=300&h=300&fit=crop', available: true },
  { id: '6', name: 'Pepperoni', category: 'Pizzas', price: 7870, description: 'Sauce tomate, mozzarella, pepperoni', image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=300&h=300&fit=crop', available: true },
  { id: '7', name: '4 Fromages', category: 'Pizzas', price: 8525, description: 'Mozzarella, gorgonzola, parmesan, chèvre', image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&h=300&fit=crop', available: true },
  { id: '8', name: 'Végétarienne', category: 'Pizzas', price: 7540, description: 'Poivrons, champignons, olives, oignons', image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=300&h=300&fit=crop', available: false },
  { id: '9', name: 'Coca-Cola', category: 'Boissons', price: 1640, description: 'Canette 33cl', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=300&h=300&fit=crop', available: true },
  { id: '10', name: 'Jus d\'Orange', category: 'Boissons', price: 1970, description: 'Jus pressé maison', image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=300&h=300&fit=crop', available: true },
  { id: '11', name: 'Eau Minérale', category: 'Boissons', price: 985, description: 'Bouteille 50cl', image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=300&h=300&fit=crop', available: true },
  { id: '12', name: 'Limonade Maison', category: 'Boissons', price: 2295, description: 'Citron frais, menthe, sucre de canne', image: 'https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9e?w=300&h=300&fit=crop', available: true },
  { id: '13', name: 'Ice Tea', category: 'Boissons', price: 1640, description: 'Thé glacé pêche', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300&h=300&fit=crop', available: true },
  { id: '14', name: 'Tiramisu', category: 'Desserts', price: 3935, description: 'Mascarpone, café, cacao', image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=300&h=300&fit=crop', available: true },
  { id: '15', name: 'Fondant Chocolat', category: 'Desserts', price: 4265, description: 'Coeur coulant au chocolat noir', image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&h=300&fit=crop', available: true },
  { id: '16', name: 'Crème Brûlée', category: 'Desserts', price: 3605, description: 'Vanille de Madagascar', image: 'https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=300&h=300&fit=crop', available: true },
  { id: '17', name: 'Frites Maison', category: 'Accompagnements', price: 2295, description: 'Frites fraîches, sel de Guérande', image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=300&h=300&fit=crop', available: true },
  { id: '18', name: 'Onion Rings', category: 'Accompagnements', price: 2625, description: 'Beignets d\'oignons croustillants', image: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=300&h=300&fit=crop', available: true },
  { id: '19', name: 'Salade César', category: 'Accompagnements', price: 3280, description: 'Laitue, parmesan, croûtons, sauce César', image: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=300&h=300&fit=crop', available: true },
  { id: '20', name: 'Nuggets Poulet', category: 'Accompagnements', price: 2950, description: '6 nuggets croustillants, sauce au choix', image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=300&h=300&fit=crop', available: true },
  { id: '21', name: 'BBQ Burger', category: 'Burgers', price: 6885, description: 'Boeuf, sauce BBQ, oignons frits, cheddar', image: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=300&h=300&fit=crop', available: true },
  { id: '22', name: 'Panna Cotta', category: 'Desserts', price: 3280, description: 'Coulis de fruits rouges', image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=300&h=300&fit=crop', available: true },
];

const now = new Date();
const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600000);

export const mockOrders: Order[] = [
  { id: 'o1', number: 'CMD-001', items: [{ ...mockProducts[0], quantity: 2 }, { ...mockProducts[8], quantity: 2 }], subtotal: 14430, tax: 1443, total: 15873, status: 'pending', type: 'dine-in', createdAt: h(0.1), customerName: 'Table 3' },
  { id: 'o2', number: 'CMD-002', items: [{ ...mockProducts[5], quantity: 1 }, { ...mockProducts[11], quantity: 1 }], subtotal: 10165, tax: 1016, total: 11181, status: 'preparing', type: 'takeaway', createdAt: h(0.3), customerName: 'Sophie M.' },
  { id: 'o3', number: 'CMD-003', items: [{ ...mockProducts[2], quantity: 1 }, { ...mockProducts[16], quantity: 1 }, { ...mockProducts[9], quantity: 1 }], subtotal: 11145, tax: 1114, total: 12259, status: 'ready', type: 'dine-in', createdAt: h(0.5), customerName: 'Table 7' },
  { id: 'o4', number: 'CMD-004', items: [{ ...mockProducts[4], quantity: 2 }, { ...mockProducts[13], quantity: 2 }], subtotal: 16400, tax: 1640, total: 18040, status: 'completed', type: 'dine-in', createdAt: h(1), customerName: 'Table 1', paymentMethod: 'Carte bancaire' },
  { id: 'o5', number: 'CMD-005', items: [{ ...mockProducts[20], quantity: 1 }, { ...mockProducts[17], quantity: 1 }, { ...mockProducts[10], quantity: 1 }], subtotal: 11160, tax: 1116, total: 12276, status: 'completed', type: 'takeaway', createdAt: h(1.5), customerName: 'Marc D.', paymentMethod: 'Espèces' },
  { id: 'o6', number: 'CMD-006', items: [{ ...mockProducts[6], quantity: 1 }], subtotal: 8525, tax: 852, total: 9377, status: 'pending', type: 'takeaway', createdAt: h(0.2), customerName: 'Lucas P.' },
  { id: 'o7', number: 'CMD-007', items: [{ ...mockProducts[1], quantity: 2 }, { ...mockProducts[16], quantity: 2 }, { ...mockProducts[8], quantity: 2 }], subtotal: 23950, tax: 2395, total: 26345, status: 'preparing', type: 'dine-in', createdAt: h(0.4), customerName: 'Table 5' },
  { id: 'o8', number: 'CMD-008', items: [{ ...mockProducts[14], quantity: 1 }, { ...mockProducts[12], quantity: 1 }], subtotal: 6230, tax: 623, total: 6853, status: 'completed', type: 'dine-in', createdAt: h(2), customerName: 'Table 2', paymentMethod: 'Carte bancaire' },
  { id: 'o9', number: 'CMD-009', items: [{ ...mockProducts[3], quantity: 1 }, { ...mockProducts[18], quantity: 1 }, { ...mockProducts[11], quantity: 1 }], subtotal: 11480, tax: 1148, total: 12628, status: 'cancelled', type: 'takeaway', createdAt: h(3), customerName: 'Ali K.' },
  { id: 'o10', number: 'CMD-010', items: [{ ...mockProducts[7], quantity: 1 }, { ...mockProducts[15], quantity: 1 }, { ...mockProducts[9], quantity: 2 }], subtotal: 15825, tax: 1582, total: 17407, status: 'ready', type: 'dine-in', createdAt: h(0.6), customerName: 'Table 9' },
  { id: 'o11', number: 'CMD-011', items: [{ ...mockProducts[0], quantity: 3 }, { ...mockProducts[16], quantity: 3 }], subtotal: 27540, tax: 2754, total: 30294, status: 'preparing', type: 'takeaway', createdAt: h(0.35), customerName: 'Julie R.' },
  { id: 'o12', number: 'CMD-012', items: [{ ...mockProducts[5], quantity: 2 }, { ...mockProducts[8], quantity: 2 }], subtotal: 19020, tax: 1902, total: 20922, status: 'completed', type: 'dine-in', createdAt: h(4), customerName: 'Table 4', paymentMethod: 'Mobile Money' },
];

export const salesData = [
  { day: 'Lun', amount: 819945 },
  { day: 'Mar', amount: 642835 },
  { day: 'Mer', amount: 970815 },
  { day: 'Jeu', amount: 721550 },
  { day: 'Ven', amount: 1147925 },
  { day: 'Sam', amount: 1377510 },
  { day: 'Dim', amount: 1082330 },
];

export const topProducts = [
  { ...mockProducts[0], sold: 145, revenue: 808350 },
  { ...mockProducts[5], sold: 120, revenue: 944400 },
  { ...mockProducts[2], sold: 98, revenue: 578200 },
  { ...mockProducts[16], sold: 210, revenue: 757050 },
  { ...mockProducts[8], sold: 185, revenue: 303140 },
];
