export function parseDateRange(query: string, instant = new Date()): { startDate?: string; endDate?: string } {
  const now = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const lowerQuery = query.toLowerCase();

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];

  for (let i = 0; i < months.length; i++) {
    if (lowerQuery.includes(months[i])) {
      const targetYear = i > month ? year - 1 : year;
      const startDate = `${targetYear}-${String(i + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(Date.UTC(targetYear, i + 1, 0)).getUTCDate();
      const endDate = `${targetYear}-${String(i + 1).padStart(2, "0")}-${lastDay}`;
      return { startDate, endDate };
    }
  }

  if (lowerQuery.includes("this month")) {
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
    return { startDate, endDate };
  }

  if (lowerQuery.includes("last month")) {
    const lastMonth = month === 0 ? 11 : month - 1;
    const targetYear = month === 0 ? year - 1 : year;
    const startDate = `${targetYear}-${String(lastMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(targetYear, lastMonth + 1, 0)).getUTCDate();
    const endDate = `${targetYear}-${String(lastMonth + 1).padStart(2, "0")}-${lastDay}`;
    return { startDate, endDate };
  }

  if (lowerQuery.includes("this week")) {
    const dayOfWeek = now.getUTCDay();
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    return {
      startDate: startOfWeek.toISOString().split("T")[0],
      endDate: endOfWeek.toISOString().split("T")[0],
    };
  }

  if (lowerQuery.includes("today")) {
    const today = now.toISOString().split("T")[0];
    return { startDate: today, endDate: today };
  }

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(now.getUTCDate() - 30);
  return {
    startDate: thirtyDaysAgo.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  };
}


export function resolveAnalyticsDateQuery(prompt: string, previousQuery?: string): string {
  const hasDate = /today|this (?:month|week)|last month|january|february|march|april|may|june|july|august|september|october|november|december/i.test(prompt);
  return hasDate ? prompt : previousQuery || prompt;
}
