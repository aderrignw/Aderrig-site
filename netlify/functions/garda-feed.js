/**
 * netlify/functions/garda-feed.js
 * Lightweight, production-safe Garda & Safety feed.
 * Returns a curated set of official Garda.ie category landing pages.
 * (No scraping; stable links; minimal risk of breaking.)
 */
export async function handler() {
  try {
    const categories = [
      { id: "crime", label: "Crime", url: "https://www.garda.ie/en/crime/" },
      { id: "crime-prevention", label: "Crime Prevention", url: "https://www.garda.ie/en/crime-prevention/" },
      { id: "fraud", label: "Fraud & Economic Crime", url: "https://www.garda.ie/en/crime/fraud.html" },
      { id: "cyber", label: "Cyber Crime", url: "https://www.garda.ie/en/crime/cyber-crime.html" },
      { id: "burglary", label: "Burglary", url: "https://www.garda.ie/en/crime/burglary.html" },
      { id: "theft", label: "Theft", url: "https://www.garda.ie/en/crime/theft-and-fraud/" },
      { id: "drugs", label: "Drugs", url: "https://www.garda.ie/en/crime/drugs.html" },
      { id: "domestic", label: "Domestic Abuse", url: "https://www.garda.ie/en/crime/domestic-abuse.html" },
      { id: "roads", label: "Roads Policing", url: "https://www.garda.ie/en/roads-policing.html" },
      { id: "community", label: "Community Policing", url: "https://www.garda.ie/en/community-policing/" }
    ];

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=900"  // 15 min
      },
      body: JSON.stringify({
        source: "garda.ie",
        updated: new Date().toISOString(),
        categories
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "garda-feed failed" })
    };
  }
}
