import { SOURCE } from '../config.js';
import { createMockSource } from './mock.js';
import { createWsSource } from './ws.js';

export function createSource() {
  return SOURCE === 'ws' ? createWsSource() : createMockSource();
}
