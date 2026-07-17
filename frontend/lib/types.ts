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
