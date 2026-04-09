import { normalizeToken } from "./helpers";

export function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in the environment.`);
  }
  return value;
}

export function getOptionalToken(name: string) {
  const rawValue = process.env[name]?.trim();
  return rawValue ? normalizeToken(rawValue) : "";
}

export function logEnvStatus(name: string) {
  const isSet = Boolean(process.env[name]?.trim());
  console.log(`${name}: ${isSet ? "Found" : "Not set"}`);
}
