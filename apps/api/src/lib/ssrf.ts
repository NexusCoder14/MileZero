import dns from "node:dns/promises";
import net from "node:net";

export class SsrcSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrcSecurityError";
  }
}

/**
 * Checks if an IP address (IPv4 or IPv6) is private, loopback, link-local, or reserved.
 */
export function isPrivateIp(ip: string): boolean {
  // Normalize IPv6-mapped IPv4 addresses like ::ffff:127.0.0.1
  const cleanIp = ip.toLowerCase().replace(/^::ffff:/, "");

  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0) return true; // Current network
    if (a === 10) return true; // RFC 1918 10.0.0.0/8
    if (a === 127) return true; // Loopback 127.0.0.0/8
    if (a === 169 && b === 254) return true; // Link-local 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918 172.16.0.0/12
    if (a === 192 && b === 168) return true; // RFC 1918 192.168.0.0/16
    if (a >= 224) return true; // Multicast & broadcast
    return false;
  }

  if (net.isIPv6(cleanIp)) {
    if (cleanIp === "::1" || cleanIp === "0:0:0:0:0:0:0:1") return true; // loopback
    if (cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:0") return true; // unspecified
    if (cleanIp.startsWith("fe80:")) return true; // link-local
    if (cleanIp.startsWith("fc00:") || cleanIp.startsWith("fd00:")) return true; // unique local
    if (cleanIp.startsWith("ff")) return true; // multicast
    return false;
  }

  return true; // Treat unknown formats as unsafe
}

export interface SafeFetchOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

/**
 * SSRF-Safe HTTP Fetcher:
 * - Only HTTPS protocol allowed
 * - Only port 443
 * - Disallows private, loopback, link-local IPs (IPv4, IPv6, IPv4-mapped)
 * - Validates redirects with full safety re-check
 * - Enforces size limits and timeouts
 * - Only accepts text / html / json content types
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<{ text: string; status: number; contentType: string; finalUrl: string }> {
  const maxSizeBytes = options.maxSizeBytes || 2 * 1024 * 1024; // 2MB default
  const timeoutMs = options.timeoutMs || 10000; // 10s default
  let currentUrl = rawUrl;
  let redirectsRemaining = options.maxRedirects ?? 3;

  while (true) {
    let urlObj: URL;
    try {
      urlObj = new URL(currentUrl);
    } catch {
      throw new SsrcSecurityError(`Invalid URL: ${currentUrl}`);
    }

    if (urlObj.protocol !== "https:") {
      throw new SsrcSecurityError(`Only HTTPS allowed, got ${urlObj.protocol}`);
    }

    const port = urlObj.port ? parseInt(urlObj.port, 10) : 443;
    if (port !== 443) {
      throw new SsrcSecurityError(`Only port 443 allowed, got port ${port}`);
    }

    const hostname = urlObj.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets if any

    // Disallow localhost by name
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      throw new SsrcSecurityError(`Disallowed hostname: ${hostname}`);
    }

    // Resolve IP address
    let addresses: string[] = [];
    if (net.isIP(hostname)) {
      addresses = [hostname];
    } else {
      try {
        const resolved = await dns.lookup(hostname, { all: true });
        addresses = resolved.map((r) => r.address);
      } catch (err: unknown) {
        throw new SsrcSecurityError(`Failed to resolve DNS for ${hostname}: ${(err as Error).message}`);
      }
    }

    if (!addresses.length) {
      throw new SsrcSecurityError(`No IP address resolved for ${hostname}`);
    }

    // Check all resolved addresses against private / loopback ranges
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new SsrcSecurityError(`SSRF blocked: ${hostname} resolved to private/loopback IP ${addr}`);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(urlObj.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "MileZero-FareVerifier/1.0 (+https://milezero.org)",
          Accept: "text/html,application/xhtml+xml,application/json,text/plain",
        },
      });

      // Handle redirect
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const loc = resp.headers.get("location");
        if (!loc) {
          throw new SsrcSecurityError(`Redirect ${resp.status} with no Location header`);
        }
        if (redirectsRemaining <= 0) {
          throw new SsrcSecurityError("Maximum redirects exceeded");
        }
        redirectsRemaining--;
        currentUrl = new URL(loc, currentUrl).toString();
        continue;
      }

      if (!resp.ok) {
        throw new Error(`HTTP error ${resp.status} fetching source page`);
      }

      const contentType = (resp.headers.get("content-type") || "").toLowerCase();
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("text/plain") &&
        !contentType.includes("application/json") &&
        !contentType.includes("application/xhtml")
      ) {
        throw new SsrcSecurityError(`Unsupported content type: ${contentType}`);
      }

      // Read text with size cap
      const reader = resp.body?.getReader();
      if (!reader) {
        const text = await resp.text();
        return { text, status: resp.status, contentType, finalUrl: currentUrl };
      }

      let totalBytes = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > maxSizeBytes) {
            controller.abort();
            throw new SsrcSecurityError(`Response body exceeded ${maxSizeBytes} bytes`);
          }
          chunks.push(value);
        }
      }

      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(merged);

      return { text, status: resp.status, contentType, finalUrl: currentUrl };
    } finally {
      clearTimeout(timeout);
    }
  }
}
