import type { JobDefinition } from '../define';
import { systemNoop } from './system-noop';

// why: JobDefinition<unknown> because the registry is heterogeneous; each definition validates its own data.
export const jobDefinitions: JobDefinition<unknown>[] = [systemNoop as JobDefinition<unknown>];
