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
