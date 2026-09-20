// TanStack Query key factory for platform administration. Super Admin data
// is platform-wide — keys are scoped by the acting user id only, never by
// ground or canteen. Kept small on purpose; add keys as later phases need
// them.
export const adminKeys = {
  all: ['admin'],
  dashboard: (userId) => ['admin', userId ?? 'anon', 'dashboard'],
  grounds: (userId) => ['admin', userId ?? 'anon', 'grounds'],
  groundRequests: (userId) => ['admin', userId ?? 'anon', 'ground-requests'],
  groundRequest: (userId, publicRequestId) => [
    'admin',
    userId ?? 'anon',
    'ground-request',
    publicRequestId ?? 'none',
  ],
  umpireRequests: (userId) => ['admin', userId ?? 'anon', 'umpire-requests'],
  owners: (userId) => ['admin', userId ?? 'anon', 'owners'],
  ownerGrounds: (userId, ownerUserId) => ['admin', userId ?? 'anon', 'owner-grounds', ownerUserId ?? 'none'],
  players: (userId) => ['admin', userId ?? 'anon', 'players'],
  umpires: (userId) => ['admin', userId ?? 'anon', 'umpires'],
  staff: (userId) => ['admin', userId ?? 'anon', 'staff'],
  auditLog: (userId, { page, eventType } = {}) => [
    'admin',
    userId ?? 'anon',
    'audit-log',
    page ?? 1,
    eventType || 'all',
  ],
  sponsors: (userId) => ['admin', userId ?? 'anon', 'sponsors'],
  amenityCatalog: (userId) => ['admin', userId ?? 'anon', 'amenity-catalog'],
  merchandise: (userId, { page, q, category, status, sort } = {}) => [
    'admin',
    userId ?? 'anon',
    'merchandise',
    page ?? 1,
    q || '',
    category || 'all',
    status || 'all',
    sort || 'order',
  ],
  merchandiseItem: (userId, id) => ['admin', userId ?? 'anon', 'merchandise-item', id ?? 'none'],
  advertisements: (userId) => ['admin', userId ?? 'anon', 'advertisements'],
}
