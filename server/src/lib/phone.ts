// Canonical phone-number normalization. Every site that reads a peer phone
// from user input (composer, "new conversation", contact import, /sms/send,
// templates rendering) MUST funnel through normalizePhone() before storing or
// comparing — otherwise "Leif" with "+12068173472" and "2068173472" end up as
// two contacts AND two conversations because UNIQUE(user_id, phone) is a
// byte-for-byte index, not a phone-equivalence index.
//
// Returns null when the input clearly isn't a phone number (too short, all
// punctuation, etc.). Callers should treat null as "reject this input."
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;                  // bare 10 = NANP
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;   // best-effort intl
  return null;
}

/** Extract the first-name token from a contact display name. */
export function firstNameFrom(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '';
  return n.split(/[\s,]+/)[0] || '';
}
