'use client';

import React from 'react';

/**
 * Renders text with search term highlighted in yellow.
 * Used for search/filter UI across admin, employee, and super-admin data views.
 */
export function highlightSearchText(text: string | number | null | undefined, search: string): React.ReactNode {
  const str = text === undefined || text === null ? '' : String(text).trim();
  const q = (search || '').trim();
  if (!q) return str;
  const lower = str.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return str;
  const before = str.slice(0, idx);
  const match = str.slice(idx, idx + q.length);
  const after = str.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="bg-yellow-300 text-gray-900 rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

/**
 * Highlights all (non-overlapping) occurrences of search in text.
 */
export function highlightAllSearchMatches(text: string | number | null | undefined, search: string): React.ReactNode {
  const str = text === undefined || text === null ? '' : String(text);
  const q = (search || '').trim();
  if (!q) return str;
  const parts: React.ReactNode[] = [];
  let remaining = str;
  const qLower = q.toLowerCase();
  let key = 0;
  while (remaining.length > 0) {
    const lower = remaining.toLowerCase();
    const idx = lower.indexOf(qLower);
    if (idx === -1) {
      if (remaining) parts.push(<React.Fragment key={key++}>{remaining}</React.Fragment>);
      break;
    }
    const before = remaining.slice(0, idx);
    const match = remaining.slice(idx, idx + q.length);
    remaining = remaining.slice(idx + q.length);
    if (before) parts.push(<React.Fragment key={key++}>{before}</React.Fragment>);
    parts.push(<mark key={key++} className="bg-yellow-300 text-gray-900 rounded px-0.5">{match}</mark>);
  }
  if (parts.length === 0) return str;
  if (parts.length === 1) return parts[0];
  return <>{parts}</>;
}
