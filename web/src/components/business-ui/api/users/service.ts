import type { AccountType } from '@/lib/toolkit-types';

export interface SearchUsersParams {
  query?: string;
  limit?: number;
}

export interface SearchUsersResponse {
  users?: unknown[];
}

export interface BatchGetUsersResponse {
  users?: unknown[];
}

export interface ConvertExternalContactResponse {
  user_id?: string;
}

export async function searchUsers(_params: SearchUsersParams): Promise<SearchUsersResponse> {
  return { users: [] };
}

export async function listUsersByIds(_userIds: string[]): Promise<BatchGetUsersResponse> {
  return { users: [] };
}

export async function convertExternalContact(
  _larkUserID: string
): Promise<ConvertExternalContactResponse> {
  return {};
}

export type { AccountType };
