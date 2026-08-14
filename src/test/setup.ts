import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// jsdom 里 fade/scale 会引入时序抖动；测的是壳、Esc、焦点，不是动画。
vi.mock('svelte/transition', () => ({ fade: () => () => {}, scale: () => () => {} }));

// vitest 未开 globals，STL 不会自己挂 afterEach。
afterEach(cleanup);
