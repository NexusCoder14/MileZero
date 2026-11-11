import { safeFetch } from "./ssrf.js";

/**
 * Normalizes text by lowercasing and collapsing whitespace.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extracts numbers from text (e.g. 111.21, 10, 20).
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d+(\.\d+)?\b/g) || [];
  return matches.map(Number).filter((n) => !isNaN(n));
}

export interface VerificationResult {
  verified: boolean;
  checkedAt: string;
  reason: string;
  matchedQuote?: boolean;
  cityFound?: boolean;
  numbersMatched?: boolean;
}

/**
 * Verifies a Groq proposal:
 * 1. Fetches source page with SSRF-safe fetcher
 * 2. Checks city name appears on the page
 * 3. Checks the proposed quote appears on the page
 * 4. Checks the proposed numbers (fares or petrol price) appear on the page
 */
export async function verifyProposal(params: {
  city: string;
  sourceUrl: string;
  quote: string;
  proposedNumbers: number[];
}): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();

  let pageText: string;
  try {
    const resp = await safeFetch(params.sourceUrl, {
      maxSizeBytes: 2 * 1024 * 1024,
      timeoutMs: 12000,
    });
    pageText = resp.text;
  } catch (err: unknown) {
    return {
      verified: false,
      checkedAt,
      reason: `Could not fetch source page safely: ${(err as Error).message}`,
    };
  }

  const normPage = normalizeText(pageText);
  const normCity = normalizeText(params.city);
  const cityFound = normPage.includes(normCity);

  if (!cityFound) {
    return {
      verified: false,
      checkedAt,
      reason: `City "${params.city}" was not found on the cited source page.`,
      cityFound: false,
    };
  }

  // Quote check
  const normQuote = normalizeText(params.quote);
  const matchedQuote = normPage.includes(normQuote);

  // Numbers check: verify proposed numbers appear in the page
  const pageNumbers = new Set(extractNumbers(pageText));
  const missingNumbers = params.proposedNumbers.filter((n) => !pageNumbers.has(n));
  const numbersMatched = missingNumbers.length === 0;

  if (!matchedQuote && !numbersMatched) {
    return {
      verified: false,
      checkedAt,
      reason: `Neither the exact quote nor the proposed numbers were found on the source page. Missing numbers: ${missingNumbers.join(", ")}`,
      cityFound: true,
      matchedQuote: false,
      numbersMatched: false,
    };
  }

  if (!numbersMatched) {
    return {
      verified: false,
      checkedAt,
      reason: `Proposed numbers not found on source page: ${missingNumbers.join(", ")}`,
      cityFound: true,
      matchedQuote,
      numbersMatched: false,
    };
  }

  return {
    verified: true,
    checkedAt,
    reason: "Source page verified: city, quote/numbers confirmed independently.",
    cityFound: true,
    matchedQuote,
    numbersMatched: true,
  };
}

