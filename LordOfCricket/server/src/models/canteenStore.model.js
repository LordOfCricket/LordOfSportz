const masterMenu = [
  {
    id: 'burger',
    name: 'Classic Burger',
    category: 'Main',
    description: 'Grilled patty, lettuce, tomato and cheese',
    price: 250,
    image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
    defaultStock: 50,
    dailyPrice: 250,
  },
  {
    id: 'sandwich',
    name: 'Veg Sandwich',
    category: 'Sandwich',
    description: 'Fresh veggies with chutney and bread',
    price: 180,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    defaultStock: 40,
    dailyPrice: 180,
  },
  {
    id: 'popcorn',
    name: 'Popcorn',
    category: 'Snacks',
    description: 'Buttery popcorn served hot',
    price: 120,
    image: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0ea?auto=format&fit=crop&w=800&q=80',
    defaultStock: 60,
    dailyPrice: 120,
  },
  {
    id: 'drink',
    name: 'Cold Drink',
    category: 'Beverage',
    description: 'Chilled soft drink to refresh',
    price: 90,
    image: 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=800&q=80',
    defaultStock: 80,
    dailyPrice: 90,
  },
  {
    id: 'fries',
    name: 'French Fries',
    category: 'Sides',
    description: 'Crispy fries with seasoning',
    price: 140,
    image: 'https://images.unsplash.com/photo-1543779505-7f603bfc748b?auto=format&fit=crop&w=800&q=80',
    defaultStock: 50,
    dailyPrice: 140,
  },
]

const todaysMenu = {
  publishedAt: new Date().toISOString(),
  itemSettings: masterMenu.reduce((acc, item) => {
    acc[item.id] = {
      id: item.id,
      available: true,
      stock: item.defaultStock,
      dailyPrice: item.dailyPrice,
    }
    return acc
  }, {}),
}

const orders = []

export { masterMenu, todaysMenu, orders }
