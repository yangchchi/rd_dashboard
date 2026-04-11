import axios from 'axios';

import { getAuthToken } from '@/lib/auth';

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
