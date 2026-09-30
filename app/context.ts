import { createContext } from 'react-router';

// Request-scoped server dependencies (React Router middleware context).
// The root middleware fills it once per request; loaders and actions read it
// with `context.get(appContext)` instead of touching process.env directly.
export interface AppEnv {
  OPENAI_API_KEY?: string;
}

export const appContext = createContext<{ env: AppEnv }>();
