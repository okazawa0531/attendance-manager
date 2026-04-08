import { fetchAuthSession } from 'aws-amplify/auth';
import { awsConfig } from '../aws-config';
import type { User, AttendanceRecord } from '../types';

async function getAuthHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: token };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<T> {
  const headers = await getAuthHeader();
  const url = new URL(`${awsConfig.apiUrl}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'API error');
  }
  return response.json();
}

// ============================================================
// Users API
// ============================================================
export const usersApi = {
  list: (): Promise<{ users: User[] }> => request('GET', '/users'),

  create: (data: {
    name: string;
    email: string;
    role: 'admin' | 'user';
    temporaryPassword: string;
  }): Promise<{ user: User }> => request('POST', '/users', data),

  delete: (userId: string): Promise<void> => request('DELETE', `/users/${userId}`),
};

// ============================================================
// Attendance API
// ============================================================
export const attendanceApi = {
  list: (params: {
    userId?: string;
    year?: string;
    month?: string;
  }): Promise<{ records: AttendanceRecord[] }> => {
    const queryParams: Record<string, string> = {};
    if (params.userId) queryParams.userId = params.userId;
    if (params.year) queryParams.year = params.year;
    if (params.month) queryParams.month = params.month;
    return request('GET', '/attendance', undefined, queryParams);
  },

  create: (data: {
    date: string;
    clockIn?: string | null;
    clockOut?: string | null;
    breakMinutes?: number;
    notes?: string;
    status?: string;
    userId?: string;
  }): Promise<{ record: AttendanceRecord }> => request('POST', '/attendance', data),

  update: (
    date: string,
    data: {
      clockIn?: string | null;
      clockOut?: string | null;
      breakMinutes?: number;
      notes?: string;
      status?: string;
      userId?: string;
    },
  ): Promise<{ record: AttendanceRecord }> => request('PUT', `/attendance/${date}`, data),

  delete: (date: string, userId?: string): Promise<void> => {
    const params: Record<string, string> = {};
    if (userId) params.userId = userId;
    return request('DELETE', `/attendance/${date}`, undefined, params);
  },
};

// ============================================================
// ヘルパー: 勤務時間計算
// ============================================================
export function calcWorkMinutes(
  clockIn: string | null,
  clockOut: string | null,
  breakMinutes: number,
): number | null {
  if (!clockIn || !clockOut) return null;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  const total = (outH * 60 + outM) - (inH * 60 + inM) - breakMinutes;
  return Math.max(0, total);
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m > 0 ? m + '分' : ''}`;
}
