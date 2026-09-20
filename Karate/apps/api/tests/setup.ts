import path from "node:path";

// Loaded before any test file imports app code, so @karate/config reads the
// test database/secrets instead of falling through to real .env values.
process.loadEnvFile(path.resolve(__dirname, "../.env.test"));
