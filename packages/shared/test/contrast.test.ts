import assert from "node:assert";

// Relative luminance helper per WCAG 2.1
function getLuminance(hex: string): number {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

const lightTokens = {
  bg: "#F4F6F5",
  surface: "#FFFFFF",
  surface2: "#EAEFEC",
  line: "#D5DCD8",
  text: "#161A18",
  muted: "#4A5750",
  primary: "#23312B",
  primaryText: "#FFFFFF",
  accent: "#3DDC97",
  accentText: "#0B1410",
  link: "#0B7A4B",
  focus: "#0B7A4B",
  danger: "#B3261E",
  dangerBg: "#FDECEA",
  warn: "#7A4B00",
  warnBg: "#FFF3D6",
  ok: "#0B6B42",
  okBg: "#E3F6EC",
};

const darkTokens = {
  bg: "#0F1412",
  surface: "#171E1B",
  surface2: "#1E2723",
  line: "#2A3631",
  text: "#E8EEEB",
  muted: "#9AA8A1",
  primary: "#3DDC97",
  primaryText: "#0B1410",
  accent: "#3DDC97",
  accentText: "#0B1410",
  link: "#5BE3A9",
  focus: "#5BE3A9",
  danger: "#FF8A80",
  dangerBg: "#2D1513",
  warn: "#F5C451",
  warnBg: "#2A2210",
  ok: "#6FE7B0",
  okBg: "#10281D",
};

console.log("Testing Light mode WCAG AA token contrast ratios...");
// Text on BG
const lightTextOnBg = getContrastRatio(lightTokens.text, lightTokens.bg);
assert(lightTextOnBg >= 4.5, `Light text on bg failed: ${lightTextOnBg}`);
assert(lightTextOnBg > 15.0, `Expected ~16.2:1, got: ${lightTextOnBg}`);

// Muted on surface
const lightMuted = getContrastRatio(lightTokens.muted, lightTokens.surface);
assert(lightMuted >= 4.5, `Light muted on surface failed: ${lightMuted}`);

// Primary text on primary button
const lightPrimary = getContrastRatio(lightTokens.primaryText, lightTokens.primary);
assert(lightPrimary >= 4.5, `Light primary text failed: ${lightPrimary}`);

// Accent text on accent
const lightAccent = getContrastRatio(lightTokens.accentText, lightTokens.accent);
assert(lightAccent >= 4.5, `Light accent text failed: ${lightAccent}`);

// Link on surface
const lightLink = getContrastRatio(lightTokens.link, lightTokens.surface);
assert(lightLink >= 4.5, `Light link failed: ${lightLink}`);

// Danger
const lightDanger = getContrastRatio(lightTokens.danger, lightTokens.dangerBg);
assert(lightDanger >= 4.5, `Light danger failed: ${lightDanger}`);

// Warn
const lightWarn = getContrastRatio(lightTokens.warn, lightTokens.warnBg);
assert(lightWarn >= 4.5, `Light warn failed: ${lightWarn}`);

// Ok
const lightOk = getContrastRatio(lightTokens.ok, lightTokens.okBg);
assert(lightOk >= 4.5, `Light ok failed: ${lightOk}`);

console.log("Testing Dark mode WCAG AA token contrast ratios...");
// Text on BG
const darkTextOnBg = getContrastRatio(darkTokens.text, darkTokens.bg);
assert(darkTextOnBg >= 4.5, `Dark text on bg failed: ${darkTextOnBg}`);
assert(darkTextOnBg > 15.0, `Expected ~15.8:1, got: ${darkTextOnBg}`);

// Muted on surface
const darkMuted = getContrastRatio(darkTokens.muted, darkTokens.surface);
assert(darkMuted >= 4.5, `Dark muted on surface failed: ${darkMuted}`);

// Primary text on primary button
const darkPrimary = getContrastRatio(darkTokens.primaryText, darkTokens.primary);
assert(darkPrimary >= 4.5, `Dark primary text failed: ${darkPrimary}`);

// Link on surface
const darkLink = getContrastRatio(darkTokens.link, darkTokens.surface);
assert(darkLink >= 4.5, `Dark link failed: ${darkLink}`);

// Danger
const darkDanger = getContrastRatio(darkTokens.danger, darkTokens.dangerBg);
assert(darkDanger >= 4.5, `Dark danger failed: ${darkDanger}`);

// Warn
const darkWarn = getContrastRatio(darkTokens.warn, darkTokens.warnBg);
assert(darkWarn >= 4.5, `Dark warn failed: ${darkWarn}`);

// Ok
const darkOk = getContrastRatio(darkTokens.ok, darkTokens.okBg);
assert(darkOk >= 4.5, `Dark ok failed: ${darkOk}`);

console.log("All WCAG AA contrast ratio checks passed successfully!");
