import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage();
export const getDemoContext = () => context.getStore() || null;
export const runDemoContext = (value, work) => context.run(value, work);
