export interface SearchChatsParams {
  query?: string;
  limit?: number;
}

export interface ChatInfo {
  chat_id?: string;
  name?: string;
}

export interface SearchChatsResponse {
  chats?: ChatInfo[];
}

export interface BatchGetChatsResponse {
  chats?: ChatInfo[];
}

export async function searchChats(_params: SearchChatsParams): Promise<SearchChatsResponse> {
  return { chats: [] };
}

export async function listChatsByIds(_chatIds: string[]): Promise<BatchGetChatsResponse> {
  return { chats: [] };
}

export type { BatchGetChatsResponse, ChatInfo, SearchChatsParams, SearchChatsResponse };
