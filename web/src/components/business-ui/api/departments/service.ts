export interface SearchDepartmentsParams {
  query?: string;
  limit?: number;
}

export interface SearchDepartmentsResponse {
  departments?: unknown[];
}

export async function searchDepartments(
  _params: SearchDepartmentsParams
): Promise<SearchDepartmentsResponse> {
  return { departments: [] };
}

export type { SearchDepartmentsParams, SearchDepartmentsResponse };
