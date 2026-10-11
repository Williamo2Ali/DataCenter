// src/utils/helpers.ts
import { v4 as uuidv4 } from 'uuid';

/**
 * دالة لتوليد معرف فريد UUID
 */
export function generateId(): string {
  return uuidv4();
}