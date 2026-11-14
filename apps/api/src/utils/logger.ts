import winston from 'winston';
import { env } from '../config/env.js';

const { combine, colorize, printf, json, timestamp } = winston.format;

const isProduction = env.NODE_ENV === 'production';

/**
 * Readable development lines. Most calls log an object (`logger.info({ event, ... })`), which
 * winston's `simple()` printed as "[object Object]"; this prints its fields as JSON instead.
 */
export const devLine = ({ level, message, ...rest }: winston.Logform.TransformableInfo): string => {
  const fields = { ...(typeof message === 'object' && message !== null ? message : {}), ...rest };
  const text = typeof message === 'string' ? message : '';
  const meta = Object.keys(fields).length ? JSON.stringify(fields) : '';
  return `${level}: ${[text, meta].filter(Boolean).join(' ')}`;
};

const logger = winston.createLogger({
  level: isProduction ? 'warn' : 'debug',
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? combine(timestamp(), json())
        : combine(colorize(), printf(devLine)),
    }),
  ],
});

export default logger;
