import { sleep } from '@/lib/utils/sleep';

// Edge Case 2: Custom error for Authentication failures
export class HhAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HhAuthError';
  }
}

// Basic interfaces for type safety
export interface HhNegotiation {
  id: string;
  state: {
    id: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
  resume: {
    id: string;
  };
  // other fields omitted for brevity
}

export interface HhMessage {
  id: string;
  text: string;
  created_at: string;
  author: {
    id: string;
    name: string;
  };
  // other fields omitted for brevity
}

export interface HhResume {
  id: string;
  title: string;
  skills: string;
  // other fields omitted for brevity
}

export class HhApiService {
  private accessToken: string;
  private userAgent: string;
  private baseUrl: string = 'https://api.hh.ru';
  private maxRetries: number = 3;

  constructor(accessToken: string, userAgent: string = 'CandidateScorer/1.0 (admin@example.com)') {
    this.accessToken = accessToken;
    this.userAgent = userAgent;
  }

  /**
   * Core fetch wrapper handling rate limits, auth errors, and network issues
   */
  private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 0): Promise<any> {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${this.accessToken}`,
      'User-Agent': this.userAgent,
    };

    try {
      const response = await fetch(url, { ...options, headers });

      // Edge Case 2: Unauthorized or Forbidden
      if (response.status === 401 || response.status === 403) {
        throw new HhAuthError(`Authentication failed with status ${response.status}. Token may be invalid or expired.`);
      }

      // Edge Case 1: Rate Limit Handling
      if (response.status === 429) {
        if (retries >= this.maxRetries) {
          throw new Error(`Max retries reached for ${url} due to 429 Too Many Requests`);
        }

        const retryAfterHeader = response.headers.get('Retry-After');
        // Exponential backoff or Retry-After header
        const delayMs = retryAfterHeader 
            ? parseInt(retryAfterHeader, 10) * 1000 
            : 3000 * Math.pow(1.5, retries);
        
        console.warn(`[HhApiService] 429 Too Many Requests on ${url}. Retrying in ${delayMs}ms (Attempt ${retries + 1}/${this.maxRetries})...`);
        await sleep(delayMs);
        
        return this.fetchWithRetry(url, options, retries + 1);
      }

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText} for URL ${url}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : {};

    } catch (error: any) {
      // Propagate specific auth errors immediately
      if (error instanceof HhAuthError) {
        throw error;
      }

      // Edge Case 3: Network Failure handling
      if (retries >= this.maxRetries) {
        throw new Error(`Failed to fetch ${url} after ${this.maxRetries} retries. Error: ${error.message}`);
      }

      // Linear delay for network/other temporary issues
      const delayMs = 3000 * (retries + 1);
      console.warn(`[HhApiService] Network/Fetch error on ${url}. Retrying in ${delayMs}ms (Attempt ${retries + 1}/${this.maxRetries})... Error: ${error.message}`);
      await sleep(delayMs);
      return this.fetchWithRetry(url, options, retries + 1);
    }
  }

  /**
   * Fetches ALL active negotiations across all HH.ru pages.
   *
   * HH.ru uses 0-based pagination. The response envelope contains:
   *   { items: [...], found: N, pages: P, per_page: 50, page: 0 }
   *
   * We loop until page >= pages (i.e., no more pages left).
   * A 500ms sleep between page requests avoids 429 Too Many Requests.
   *
   * @param perPage - Results per page (max 100 on HH.ru, 50 is safe)
   */
  async getNegotiations(perPage = 50): Promise<HhNegotiation[]> {
    const all: HhNegotiation[] = [];
    let page = 0;

    while (true) {
      const url = `${this.baseUrl}/negotiations?page=${page}&per_page=${perPage}`;
      const data = await this.fetchWithRetry(url);

      const items: HhNegotiation[] = data.items || [];
      all.push(...items);

      const totalPages: number = data.pages ?? 1;

      // HH.ru pages are 0-indexed: last page = totalPages - 1
      if (page >= totalPages - 1 || items.length === 0) break;

      page++;

      // Throttle: 500ms between page requests to stay within HH.ru rate limits
      const { sleep } = await import('@/lib/utils/sleep');
      await sleep(500);
    }

    console.info(
      `[HhApiService] getNegotiations: fetched ${all.length} negotiations across ${page + 1} page(s).`,
    );
    return all;
  }

  /**
   * Fetches the chat history for a specific application
   */
  async getMessages(negotiationId: string): Promise<HhMessage[]> {
    const url = `${this.baseUrl}/negotiations/${negotiationId}/messages`;
    const data = await this.fetchWithRetry(url);
    return data.items || [];
  }

  /**
   * Fetches parsed CV data
   */
  async getResume(resumeUrl: string): Promise<HhResume> {
    // If the URL is absolute, use it. Otherwise, append to baseUrl.
    const url = resumeUrl.startsWith('http') ? resumeUrl : `${this.baseUrl}/resumes/${resumeUrl}`;
    const data = await this.fetchWithRetry(url);
    return data;
  }

  /**
   * Sends an automatic rejection for an employer-initiated negotiation.
   *
   * Endpoint: PUT https://api.hh.ru/negotiations/discard_by_employer/{negotiationId}
   *
   * @param negotiationId - The HH.ru negotiation (response/отклик) ID to reject.
   * @param message       - Optional rejection message shown to the candidate.
   * @throws {HhAuthError}  On 401/403 — token expired or app lacks permission.
   * @throws {Error}        On other HTTP errors or network failures.
   */
  async rejectCandidate(negotiationId: string, message?: string): Promise<void> {
    const url = `${this.baseUrl}/negotiations/discard_by_employer/${negotiationId}`;

    const body: Record<string, string> = {};
    if (message) {
      body['message'] = message;
    }

    await this.fetchWithRetry(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Sends a chat message to a candidate in an existing negotiation thread.
   *
   * Endpoint: POST https://api.hh.ru/negotiations/{negotiationId}/messages
   *
   * The HH.ru API expects application/x-www-form-urlencoded for this endpoint.
   * The message text is sent as the `message` field.
   *
   * @param negotiationId - The HH.ru negotiation ID whose thread receives the message.
   * @param text          - The message body to send to the candidate.
   * @throws {HhAuthError}  On 401/403 — token expired or insufficient employer permissions.
   * @throws {Error}        On other HTTP errors or network failures.
   */
  async sendMessage(negotiationId: string, text: string): Promise<void> {
    const url = `${this.baseUrl}/negotiations/${negotiationId}/messages`;

    // HH.ru messages endpoint requires form-encoded body
    const formBody = new URLSearchParams({ message: text });

    await this.fetchWithRetry(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    formBody.toString(),
    });
  }
}
