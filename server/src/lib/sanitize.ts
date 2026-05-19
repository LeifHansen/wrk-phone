import sanitizeHtml from 'sanitize-html';

// Single source of truth for blog HTML sanitization. Applied on EVERY write
// path (AI-generated drafts and manual superadmin posts) so stored content
// is always safe to render — strict allowlist, anything else dropped.
export function sanitizeBodyHtml(html: string): string {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br', 'blockquote'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}
