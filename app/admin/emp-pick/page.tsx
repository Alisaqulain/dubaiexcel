import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

/** Legacy URL — combined UI lives at /admin/format-view */
export default function EmpPickRedirectPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(searchParams)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) val.forEach((v) => sp.append(key, v));
    else sp.set(key, val);
  }
  const qs = sp.toString();
  redirect(`/admin/format-view${qs ? `?${qs}` : ''}`);
}
