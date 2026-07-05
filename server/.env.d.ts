// Type definitions for dotenv
// This file tells TypeScript that environment variables are available
declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    JWT_SECRET?: string;
    REDIS_URL?: string;
    PUBLIC_BASE_URL?: string;
    AI_BASE_URL?: string;
    AI_API_KEY?: string;
    AI_MODEL?: string;
  }
}