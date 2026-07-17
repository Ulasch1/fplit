export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  owner_id: string;
  status: 'ACTIVE' | 'CLOSED';
  created_at: string;
  net_balance_kurus: number;
}

export interface GroupMember {
  user_id: string;
  name: string;
  joined_at: string;
}

export interface ExpenseSplit {
  user_id: string;
  share_amount_kurus: number;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount_kurus: number;
  paid_by: string;
  created_at: string;
  splits: ExpenseSplit[];
}

export interface ChecklistTransfer {
  from_user: string;
  to_user: string;
  amount_kurus: number;
  pending_payment_id: string | null;
}

export interface GroupDetail {
  id: string;
  name: string;
  owner_id: string;
  status: 'ACTIVE' | 'CLOSED';
  created_at: string;
  members: GroupMember[];
  expenses: Expense[];
  checklist: ChecklistTransfer[];
}

export interface InviteLinkResponse {
  token: string;
  status: 'PENDING';
  expires_at: string;
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  status: 'ACTIVE' | 'CLOSED';
  created_at: string;
}

export type RejectionReason = 'FORGOT' | 'WRONG_AMOUNT' | 'OTHER';

export type PaymentStatus = 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED';

export interface Payment {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount_kurus: number;
  status: PaymentStatus;
  created_at: string;
  confirmed_at: string | null;
  rejection_reason: RejectionReason | null;
  rejection_note: string | null;
}

export interface NotificationItem {
  id: string;
  type: string; // currently only 'SETTLEMENT_CONFIRMATION_REQUEST'
  related_payment_id: string;
  is_read: boolean;
  created_at: string;
  payment: Payment;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unread_count: number;
}
