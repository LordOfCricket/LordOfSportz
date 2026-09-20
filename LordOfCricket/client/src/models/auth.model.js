// Mirrors the server's PASSWORD_MIN_LENGTH (server/src/domain/otpAuth/password.js),
// the one password policy every password path (staff creation, password
// change, admin temp-credential) is unified onto.
export const MIN_PASSWORD_LENGTH = 8
