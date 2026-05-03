const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|credential|private[_-]?key|authorization)/i;
const SAFE_POLICY_KEY_PATTERN = /^(noSecretPolicy|secretPolicy|redactionPolicy)$/i;
const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_\-]{16,}/,
  /Bearer\s+[A-Za-z0-9._\-]{8,}/i,
  /-----BEGIN\s+(?:RSA\s+|OPENSSH\s+|EC\s+)?PRIVATE KEY-----/,
  /(?:xox[baprs]-)[A-Za-z0-9-]{10,}/,
  /[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{20,}/
];

export function sanitizeForManifest<T>(value: T): T {
  return sanitize(value, undefined) as T;
}

export function assertNoSecrets(value: unknown): void {
  const findings: string[] = [];
  scan(value, "root", findings);
  if (findings.length > 0) {
    throw new Error(`Secret-like value detected: ${findings.slice(0, 3).join(", ")}`);
  }
}

function sanitize(value: unknown, key: string | undefined): unknown {
  if (typeof value === "string") {
    if ((key && isSensitiveKey(key) && value.length > 0) || looksSecret(value)) {
      return "[REDACTED]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitize(entry, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]));
  }
  return value;
}

function scan(value: unknown, path: string, findings: string[]): void {
  if (typeof value === "string") {
    if (looksSecret(value)) {
      findings.push(path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scan(entry, `${path}[${index}]`, findings));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entryValue] of Object.entries(value)) {
      if (isSensitiveKey(key) && typeof entryValue === "string" && entryValue.length > 0 && !isSafeEnvReference(entryValue)) {
        findings.push(`${path}.${key}`);
      }
      scan(entryValue, `${path}.${key}`, findings);
    }
  }
}

function looksSecret(value: string): boolean {
  if (isSafeEnvReference(value)) {
    return false;
  }
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) && !SAFE_POLICY_KEY_PATTERN.test(key);
}

function isSafeEnvReference(value: string): boolean {
  return /^[A-Z][A-Z0-9_]{4,}$/.test(value) || /^\$\{[A-Z][A-Z0-9_]{4,}\}$/.test(value);
}
