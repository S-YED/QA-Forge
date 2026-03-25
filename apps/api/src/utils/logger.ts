import winston from 'winston';
import { env } from '../config/env.js';

const { combine, colorize, simple, json, timestamp } = winston.format;

const isProduction = env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProduction ? 'warn' : 'debug',
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? combine(timestamp(), json())
        : combine(colorize(), simple()),
    }),
  ],
});

export default logger;
