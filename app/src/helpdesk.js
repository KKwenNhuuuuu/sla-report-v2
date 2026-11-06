export class HelpdeskClient {
  constructor({
    baseUrl = process.env.HELPDESK_URL || "http://localhost:4010",
    token = process.env.HELPDESK_TOKEN || "",
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  // GET a path (e.g. "/some/endpoint") with optional query params; returns parsed JSON.
  async get(pathname, params = {}) {
    const url = new URL(this.baseUrl + pathname);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      // Error 429 - Too Many Requests (API rate limit exceeded)
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10);
        console.log(`API rate limit exceeded (429) at ${pathname}. Waiting ${retryAfter} seconds...`);
        
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        
        return this.get(pathname, params); 
      }
      
      const body = await res.text();
      throw new Error(`Helpdesk API GET ${url} failed: ${res.status} ${body}`);
    }

    return res.json();
  }
}

export const client = new HelpdeskClient();