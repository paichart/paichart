/**
 * Centralized HTML Sanitization Utilities
 * Prevents XSS attacks by sanitizing user-generated content
 *
 * @module lib/utils/sanitize
 * @see P1 #1 XSS Protection - Q4 2025 Security Review
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize user-generated text for safe inline display
 * Only allows basic formatting tags
 */
export function sanitizeInlineText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['strong', 'em', 'code', 'b', 'i', 'u'],
    allowedAttributes: {
      'code': ['class']
    }
  });
}

/**
 * Sanitize rich HTML content (descriptions, notes, comments)
 * Allows common formatting but blocks dangerous elements
 */
export function sanitizeRichContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'strong', 'em', 'b', 'i', 'u', 'code', 'pre',
      'blockquote', 'a', 'span'
    ],
    allowedAttributes: {
      'a': ['href', 'target', 'rel'],
      '*': ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      'a': (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      })
    }
  });
}

/**
 * Sanitize HTML for iframe preview
 * More permissive but still blocks XSS vectors
 */
export function sanitizePreviewHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'style', 'table', 'thead', 'tbody', 'tr', 'th', 'td']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      'a': ['href', 'name', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      'table': ['class', 'border'],
      '*': ['class', 'style']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
      img: ['http', 'https']
    },
    transformTags: {
      'a': (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      })
    }
  });
}

/**
 * Strip all HTML tags - for plain text output
 */
export function stripHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {}
  });
}

/**
 * Escape HTML entities without stripping
 * Use when you want to display HTML as text
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => htmlEntities[char] || char);
}
