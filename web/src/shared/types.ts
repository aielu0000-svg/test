export type Role = "admin" | "executor";
export type ProjectStatus = "active" | "archived";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  role: Role;
  mustChangePassword: boolean;
  onboardingCompleted: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  assigned: boolean;
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}
