/**
 * netlify/functions/garda-feed.js
 * Fast official Garda resource feed for dashboard.
 * Returns curated official Garda links immediately to avoid slow page loads.
 */

const categories = [
  { id: 'crime-prevention', label: 'Crime Prevention', url: 'https://www.garda.ie/en/crime-prevention/', snippet: 'Official Garda crime-prevention hub with practical home and community safety guidance.', category: 'Community Policing' },
  { id: 'neighbourhood-watch', label: 'Neighbourhood Watch', url: 'https://www.garda.ie/en/crime-prevention/community-engagement/neighbourhood-watch.html', snippet: 'Official Garda guidance on setting up and supporting a local Neighbourhood Watch scheme.', category: 'Community Policing' },
  { id: 'community-alert', label: 'Community Alert', url: 'https://www.garda.ie/en/crime-prevention/community-engagement/community-alert.html', snippet: 'Official Garda guidance on Community Alert and local community-safety partnership work.', category: 'Community Policing' },
  { id: 'fraud', label: 'Fraud', url: 'https://www.garda.ie/en/crime/fraud/', snippet: 'Advice on scams, fraud attempts and how to report economic crime.', category: 'Fraud / Economic Crime' },
  { id: 'cyber', label: 'Cyber Crime', url: 'https://www.garda.ie/en/crime/cyber-crime/', snippet: 'Official Garda cyber-crime information and online safety guidance.', category: 'Cyber Crime' },
  { id: 'burglary-theft', label: 'Burglary & Theft', url: 'https://www.garda.ie/en/crime/burglary-theft/', snippet: 'Guidance related to burglary and theft, including prevention and reporting.', category: 'Burglary & Theft' },
  { id: 'drugs', label: 'Drugs', url: 'https://www.garda.ie/en/crime/drugs/', snippet: 'Official Garda information on drug-related crime and community safety.', category: 'Drugs' },
  { id: 'domestic-abuse', label: 'Domestic Abuse', url: 'https://www.garda.ie/en/crime/domestic-abuse/domestic-abuse.html', snippet: 'Support and reporting information for domestic abuse, including emergency contacts.', category: 'Domestic Abuse' },
  { id: 'roads-policing', label: 'Road Safety', url: 'https://www.garda.ie/en/roads-policing/road-safety/', snippet: 'Road-safety information and advice from An Garda Síochána.', category: 'Traffic Matters' },
  { id: 'traffic-matters', label: 'Traffic Matters', url: 'https://www.garda.ie/en/crime/traffic-matters/', snippet: 'Traffic offences, road-safety guidance and dangerous driving reporting information.', category: 'Traffic Matters' },
  { id: 'contacts', label: 'Useful Contacts', url: 'https://www.garda.ie/en/contact-us/useful-contact-numbers/', snippet: 'Emergency and useful Garda contact numbers. In an emergency call 999 or 112.', category: 'Other' },
  { id: 'station-directory', label: 'Station Directory', url: 'https://www.garda.ie/en/contact-us/station-directory/', snippet: 'Find local Garda station details and contact information.', category: 'Other' }
];

export default async function handler() {
  return new Response(JSON.stringify({
    source: 'garda.ie',
    updated: new Date().toISOString(),
    recent: [],
    categories,
    emergency: {
      urgent: '999/112',
      confidential: '1800 666 111',
      contactsUrl: 'https://www.garda.ie/en/contact-us/useful-contact-numbers/'
    }
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
}
