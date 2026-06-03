import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BASE_URL = 'https://api.eduzz.com';
// Eduzz Nutror rate limit is 200 req/min. We pace at ~280ms between requests
// (≈215 req/min nominal, but in practice latency keeps us well under the limit).
const MIN_REQUEST_INTERVAL_MS = 280;

export interface EduzzStudent {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface EduzzEnrollmentCourse {
  title: string;
  hash: string;
}

export interface EduzzEnrollment {
  id: string;
  createdAt: string;
  status: 'active' | 'inactive';
  allModulesReleased: boolean | null;
  expiredAt: string | null;
  acceptedTermAt: string | null;
  content: {
    type: string;
    courses: EduzzEnrollmentCourse[];
  };
  progress: number;
}

interface PaginatedResponse<T> {
  pages: number;
  page: number;
  itemsPerPage: number;
  totalItems: number;
  items: T[];
}

@Injectable()
export class EduzzApiClient {
  private readonly logger = new Logger(EduzzApiClient.name);
  private readonly pat: string;
  private lastRequestAt = 0;

  constructor(private readonly config: ConfigService) {
    const pat = this.config.get<string>('EDUZZ_API_PAT');
    if (!pat) throw new Error('EDUZZ_API_PAT not configured');
    this.pat = pat;
  }

  private async paced<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const wait = MIN_REQUEST_INTERVAL_MS - (now - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    return fn();
  }

  private async get<T>(path: string): Promise<T> {
    return this.paced(async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${this.pat}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Eduzz GET ${path} failed: ${res.status} ${body.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    });
  }

  /**
   * Iterate all students across all pages. itemsPerPage is capped at 50 by the API.
   */
  async *iterStudents(): AsyncGenerator<EduzzStudent> {
    const itemsPerPage = 50;
    let page = 1;
    while (true) {
      const res = await this.get<PaginatedResponse<EduzzStudent>>(
        `/nutror/v1/students?page=${page}&itemsPerPage=${itemsPerPage}`,
      );
      for (const item of res.items) yield item;
      if (page >= res.pages || res.items.length === 0) break;
      page += 1;
    }
  }

  async listEnrollments(studentId: string): Promise<EduzzEnrollment[]> {
    const out: EduzzEnrollment[] = [];
    const itemsPerPage = 50;
    let page = 1;
    while (true) {
      const res = await this.get<PaginatedResponse<EduzzEnrollment>>(
        `/nutror/v1/students/${encodeURIComponent(studentId)}/enrollments?page=${page}&itemsPerPage=${itemsPerPage}`,
      );
      out.push(...res.items);
      if (page >= res.pages || res.items.length === 0) break;
      page += 1;
    }
    return out;
  }
}
