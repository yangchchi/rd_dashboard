export function getEnv(): 'development' | 'production' | 'staging' | 'local' {
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}
