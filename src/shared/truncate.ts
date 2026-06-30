export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");

  if (lastSpace > maxChars * 0.8) {
    return slice.slice(0, lastSpace).trimEnd() + "…";
  }

  return slice.trimEnd() + "…";
}
