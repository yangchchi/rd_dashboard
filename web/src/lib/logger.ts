const prefix = '[rd-dashboard]';

export const logger = {
  info: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.info(prefix, ...args);
  },
  warn: (...args: unknown[]) => console.warn(prefix, ...args),
  error: (...args: unknown[]) => console.error(prefix, ...args),
};
