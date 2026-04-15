export type UserRole = 'admin' | 'user';

export type AttendanceStatus = 'present' | 'absent' | 'holiday' | 'paid_leave';

export type WorkType = 'office' | 'remote' | 'office_then_remote' | 'remote_then_office';

export interface User {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AttendanceRecord {
  userId: string;
  date: string; // YYYY-MM-DD
  clockIn: string | null; // HH:MM
  clockOut: string | null; // HH:MM
  breakMinutes: number;
  notes: string;
  status: AttendanceStatus;
  workType: WorkType | null;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: '出勤',
  absent: '欠勤',
  holiday: '休日',
  paid_leave: '有給休暇',
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  office: '出社',
  remote: '在宅',
  office_then_remote: '出社後在宅',
  remote_then_office: '在宅後出社',
};
