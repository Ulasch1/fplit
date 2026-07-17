import type {
  AuthResponse,
  GroupSummary,
  Group,
  GroupDetail,
  InviteLinkResponse,
  Expense,
  ChecklistTransfer,
  Payment,
  RejectionReason,
  NotificationsResponse
} from '@/lib/types';
import { getToken } from '@/lib/auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  body: any;

  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    auth?: boolean;
  }
): Promise<T> {
  const url = BASE_URL + path;
  const headers: Record<string, string> = {};

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (options?.auth !== false && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const method = options?.method ?? 'GET';
  const fetchOptions: RequestInit = { method, headers };
  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    let parsedBody: any;
    try {
      parsedBody = await res.json();
    } catch {
      parsedBody = {};
    }
    const message =
      parsedBody && typeof parsedBody.error === 'string'
        ? parsedBody.error
        : res.statusText;
    throw new ApiError(message, res.status, parsedBody);
  }

  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}

// ---------- typed helpers ----------

export function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: { email, password, name },
    auth: false
  });
}

export function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false
  });
}

export function listGroups(): Promise<GroupSummary[]> {
  return apiFetch<GroupSummary[]>('/groups');
}

export function createGroup(name: string): Promise<Group> {
  return apiFetch<Group>('/groups', {
    method: 'POST',
    body: { name }
  });
}

export function getGroup(id: string): Promise<GroupDetail> {
  return apiFetch<GroupDetail>(`/groups/${id}`);
}

export function createInviteLink(
  groupId: string
): Promise<InviteLinkResponse> {
  return apiFetch<InviteLinkResponse>(`/groups/${groupId}/invite-link`, {
    method: 'POST'
  });
}

export function acceptInvite(token: string): Promise<Group> {
  return apiFetch<Group>(`/invite-links/${token}/accept`, {
    method: 'POST'
  });
}

export function listExpenses(groupId: string): Promise<Expense[]> {
  return apiFetch<Expense[]>(`/groups/${groupId}/expenses`);
}

export function addExpense(
  groupId: string,
  description: string,
  amount_kurus: number,
  paid_by: string
): Promise<Expense> {
  return apiFetch<Expense>(`/groups/${groupId}/expenses`, {
    method: 'POST',
    body: { description, amount_kurus, paid_by }
  });
}

export function getChecklist(
  groupId: string
): Promise<ChecklistTransfer[]> {
  return apiFetch<ChecklistTransfer[]>(`/groups/${groupId}/checklist`);
}

export function createPayment(groupId: string, to_user: string, amount_kurus: number): Promise<Payment> {
  return apiFetch<Payment>(`/groups/${groupId}/payments`, {
    method: 'POST',
    body: { to_user, amount_kurus }
  });
}

export function resolvePayment(
  paymentId: string,
  action: 'CONFIRM' | 'REJECT',
  rejection_reason?: RejectionReason,
  rejection_note?: string
): Promise<Payment> {
  const body: any = action === 'CONFIRM'
    ? { action }
    : { action, rejection_reason, ...(rejection_note ? { rejection_note } : {}) };
  return apiFetch<Payment>(`/payments/${paymentId}`, {
    method: 'PATCH',
    body
  });
}

export function listNotifications(): Promise<NotificationsResponse> {
  return apiFetch<NotificationsResponse>(`/notifications`);
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${id}/read`, { method: 'PATCH' });
}
