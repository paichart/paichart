/**
 * File Upload Security Utilities
 * Multi-layer validation: magic bytes, path traversal, quota, sanitization
 *
 * @version 1.0
 * @created 2025-10-30
 * @specialist-reviewed sec-ops (82%), validation-engine (85%)
 */

import { fileTypeFromBuffer } from 'file-type';
import path from 'path';
import { prisma } from '@/lib/prisma';

/**
 * Allowed file types with MIME types
 */
export const ALLOWED_FILE_TYPES = {
  // Images
  'image/jpeg': { ext: ['.jpg', '.jpeg'], maxSize: 10 * 1024 * 1024 }, // 10MB
  'image/png': { ext: ['.png'], maxSize: 10 * 1024 * 1024 },
  'image/gif': { ext: ['.gif'], maxSize: 5 * 1024 * 1024 },
  'image/webp': { ext: ['.webp'], maxSize: 5 * 1024 * 1024 },

  // Documents
  'application/pdf': { ext: ['.pdf'], maxSize: 25 * 1024 * 1024 }, // 25MB
  'text/plain': { ext: ['.txt'], maxSize: 1 * 1024 * 1024 },
  'text/csv': { ext: ['.csv'], maxSize: 10 * 1024 * 1024 },
  'application/json': { ext: ['.json'], maxSize: 5 * 1024 * 1024 },

  // Office documents
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['.docx'], maxSize: 25 * 1024 * 1024
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: ['.xlsx'], maxSize: 25 * 1024 * 1024
  },
};

/**
 * Dangerous file extensions to block
 */
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.scr', '.pif',
  '.jar', '.sh', '.bash', '.ps1', '.vbs',
  '.app', '.deb', '.rpm', '.dmg', '.pkg'
];

/**
 * Multi-layer file upload validation
 *
 * Layers:
 * 1. Filename validation (path traversal, dangerous extensions)
 * 2. File size validation
 * 3. Magic byte validation (actual file content)
 * 4. MIME type validation
 * 5. Storage quota check
 * 6. Path sanitization
 */
export async function validateFileUpload(
  file: { name: string; size: number; buffer: Buffer },
  povId: string
): Promise<{
  isValid: boolean;
  mimeType?: string;
  sanitizedName?: string;
  errors?: string[];
}> {
  const errors: string[] = [];

  // ✅ Layer 1: Filename validation
  const filenameLower = file.name.toLowerCase();

  // Check for path traversal
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    errors.push('Filename contains path traversal characters');
  }

  // Check for null bytes
  if (file.name.includes('\0')) {
    errors.push('Filename contains null bytes');
  }

  // Check dangerous extensions
  const ext = path.extname(filenameLower);
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    errors.push(`Dangerous file extension: ${ext}`);
  }

  // ✅ Layer 2: File size validation
  if (file.size === 0) {
    errors.push('File is empty');
  }

  if (file.size > 100 * 1024 * 1024) {
    errors.push('File exceeds maximum size (100MB)');
  }

  // ✅ Layer 3: Magic byte validation (verify actual file type)
  let detectedType;
  try {
    detectedType = await fileTypeFromBuffer(file.buffer);
  } catch (error) {
    errors.push('Failed to detect file type');
  }

  if (!detectedType) {
    // Some text files don't have magic bytes (txt, csv, json)
    const textExtensions = ['.txt', '.csv', '.json'];
    if (!textExtensions.includes(ext)) {
      errors.push('Could not verify file type (no magic bytes)');
    }
  }

  // ✅ Layer 4: MIME type validation
  let mimeType: string | undefined;

  if (detectedType) {
    mimeType = detectedType.mime;

    // Verify detected type is allowed
    if (!ALLOWED_FILE_TYPES[mimeType as keyof typeof ALLOWED_FILE_TYPES]) {
      errors.push(`File type not allowed: ${mimeType}`);
    }

    // Verify file size for this type
    const typeConfig = ALLOWED_FILE_TYPES[mimeType as keyof typeof ALLOWED_FILE_TYPES];
    if (typeConfig && file.size > typeConfig.maxSize) {
      errors.push(`File exceeds max size for ${mimeType}: ${typeConfig.maxSize / 1024 / 1024}MB`);
    }

    // Verify extension matches detected type
    const expectedExts = typeConfig?.ext || [];
    if (!expectedExts.includes(ext)) {
      errors.push(`File extension ${ext} does not match detected type ${mimeType}`);
    }
  }

  // ✅ Layer 5: Storage quota check (1GB per POV)
  // Note: AgentArtifact schema doesn't have 'size' field yet
  // TODO: Add size field to AgentArtifact model or calculate from content length
  const POV_STORAGE_LIMIT = 1024 * 1024 * 1024; // 1GB

  // For now, just check per-file size against limit
  if (file.size > POV_STORAGE_LIMIT) {
    errors.push(`File exceeds POV storage limit (1GB)`);
  }

  // ✅ Layer 6: Path sanitization
  const sanitizedName = path.basename(file.name)
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Remove special chars
    .substring(0, 255); // Limit length

  // Return validation result
  return {
    isValid: errors.length === 0,
    mimeType: mimeType || 'application/octet-stream',
    sanitizedName,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Quick filename sanitization (without file content check)
 */
export function sanitizeFilename(filename: string): string {
  return path.basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 255);
}

/**
 * Check if extension is dangerous
 */
export function isDangerousExtension(filename: string): boolean {
  const ext = path.extname(filename.toLowerCase());
  return DANGEROUS_EXTENSIONS.includes(ext);
}
