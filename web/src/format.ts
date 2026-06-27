// Short-date formatter. INTENTIONAL DEFECT hook: with localeBug armed it formats
// in de-DE (dot separators, DD.MM.YY) instead of en-US (slash separators,
// M/D/YY) — a locale/i18n rendering defect a correct test should flag (REPORT).
export function formatShortDate(iso: string, localeBug: boolean): string {
  const locale = localeBug ? "de-DE" : "en-US";
  return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(
    new Date(iso),
  );
}
