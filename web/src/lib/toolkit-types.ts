/** 替代 @lark-apaas/client-toolkit/tools/services 中的类型，供业务组件编译通过 */

export type AccountType = 'apaas' | 'lark';

export interface SearchAvatar {
  image?: { large?: string };
}

export interface UserInfo {
  user_id?: string;
  name?: string;
  email?: string;
  avatar?: SearchAvatar;
}

export interface DepartmentInfo {
  department_id?: string;
  name?: string;
}

export interface UserProfileData {
  user_id?: string;
  name?: { language_code?: number; text?: string }[];
  avatar?: { image?: { large?: string } };
  email?: string;
}
