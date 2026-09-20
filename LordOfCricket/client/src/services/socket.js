// Shared Socket.IO connection URL — one server, multiple feature domains
// (canteen, cricket). Not domain-specific; canteen and cricket both import
// from here instead of each defining their own copy.
export const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
