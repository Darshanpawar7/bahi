export interface SacSuggestion {
  code: string;
  label: string;
}

/**
 * Common service accounting codes for freelancers and small studios.
 * Suggestions only: the right code depends on the service actually supplied.
 */
export const SAC_SUGGESTIONS: readonly SacSuggestion[] = [
  { code: '998314', label: 'IT design and development' },
  { code: '998313', label: 'IT consulting and support' },
  { code: '998315', label: 'Hosting and IT infrastructure provisioning' },
  { code: '998316', label: 'IT infrastructure and network management' },
  { code: '998319', label: 'Other IT services' },
  { code: '998391', label: 'Specialty design services' },
  { code: '998361', label: 'Advertising services' },
  { code: '998371', label: 'Market research' },
  { code: '998382', label: 'Advertising and related photography' },
  { code: '998383', label: 'Event photography and videography' },
  { code: '998311', label: 'Management consulting' },
  { code: '998312', label: 'Business consulting and public relations' },
  { code: '998395', label: 'Translation and interpretation' },
  { code: '998222', label: 'Accounting and bookkeeping' },
  { code: '999293', label: 'Commercial training and coaching' },
  { code: '998399', label: 'Other professional, technical and business services' },
];

export function searchSac(query: string, limit = 6): SacSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return SAC_SUGGESTIONS.slice(0, limit);
  return SAC_SUGGESTIONS.filter(
    item => item.code.startsWith(needle) || item.label.toLowerCase().includes(needle),
  ).slice(0, limit);
}
