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
   * Fetches the list of active applications (negotiations)
   */
  async getNegotiations(): Promise<HhNegotiation[]> {
    const url = `${this.baseUrl}/negotiations`;
    const data = await this.fetchWithRetry(url);
    // Assuming the API returns a paginated list with an 'items' array
    return data.items || [];
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
}
