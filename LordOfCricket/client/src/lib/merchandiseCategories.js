export const MERCHANDISE_CATEGORIES = [
  {
    slug: 'bats',
    name: 'Cricket Bats',
    icon: '🏏',
    attributes: [
      { key: 'batType', label: 'Bat Type' },
      { key: 'brand', label: 'Brand' },
      { key: 'size', label: 'Size' },
      { key: 'weight', label: 'Weight' },
      { key: 'material', label: 'Material' },
    ],
  },
  {
    slug: 'balls',
    name: 'Cricket Balls',
    icon: '🥎',
    attributes: [
      { key: 'ballType', label: 'Ball Type' },
      { key: 'brand', label: 'Brand' },
      { key: 'material', label: 'Leather / Tennis' },
      { key: 'color', label: 'Color' },
    ],
  },
  {
    slug: 'jerseys',
    name: 'Cricket Jerseys',
    icon: '🎽',
    attributes: [
      { key: 'size', label: 'Size' },
      { key: 'color', label: 'Color' },
      { key: 'teamDesign', label: 'Team / Design' },
      { key: 'fabric', label: 'Fabric' },
    ],
  },
  {
    slug: 'shoes',
    name: 'Cricket Shoes',
    icon: '👟',
    attributes: [
      { key: 'size', label: 'Size' },
      { key: 'brand', label: 'Brand' },
      { key: 'surfaceType', label: 'Surface Type' },
      { key: 'color', label: 'Color' },
    ],
  },
  {
    slug: 'accessories',
    name: 'Cricket Accessories',
    icon: '🧢',
    attributes: [
      { key: 'accessoryType', label: 'Accessory Type' },
      { key: 'brand', label: 'Brand' },
      { key: 'size', label: 'Size' },
    ],
  },
  {
    slug: 'protective-gear',
    name: 'Protective Gear',
    icon: '🧤',
    attributes: [
      { key: 'gearType', label: 'Gear Type' },
      { key: 'size', label: 'Size' },
      { key: 'brand', label: 'Brand' },
      { key: 'protectionLevel', label: 'Protection Level' },
    ],
  },
]

export function categoryBySlug(slug) {
  return MERCHANDISE_CATEGORIES.find((c) => c.slug === slug) || null
}
