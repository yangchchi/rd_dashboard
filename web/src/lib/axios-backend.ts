import axios from 'axios';

import { AuthSessionExpiredError, forceRedirectToLogin, getAuthToken } from '@/lib/auth';

const baseURL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_BASE || ''
    : process.env.INTERNAL_API_ORIGIN || '';

export const axiosForBackend = axios.create({
  baseURL,
  timeout: 120_000,
});

axiosForBackend.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? getAuthToken() : null;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosForBackend.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      forceRedirectToLogin();
      return Promise.reject(new AuthSessionExpiredError());
    }
    return Promise.reject(error);
  }
);
