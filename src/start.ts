import { createStart } from '@tanstack/react-start';
import { attachAuth } from '@/lib/attach-auth';

export const startInstance = createStart(() => ({
  functionMiddleware: [attachAuth],
}));
