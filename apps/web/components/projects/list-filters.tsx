'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AGES = [
  ['all', 'Any time'],
  ['1', 'Last 24 hours'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
] as const;

interface ListFiltersProps {
  /** What the list holds, for labels: "runs" or "bugs". */
  noun: string;
  statuses: readonly (readonly [value: string, label: string])[];
  /** Show a search box (the bug list has one). */
  search?: boolean;
  /** Called with the filters as a query string to add to the list request, e.g. "&status=failed&days=7" ("" for none). */
  onChange: (query: string) => void;
}

/** F6: status, age and (optionally) text filters for a list. The server does the filtering. */
export function ListFilters({ noun, statuses, search, onChange }: ListFiltersProps) {
  const [status, setStatus] = useState('all');
  const [days, setDays] = useState('all');
  const [text, setText] = useState('');
  const sent = useRef('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (days !== 'all') params.set('days', days);
    if (text.trim()) params.set('q', text.trim());
    const query = params.size ? `&${params}` : '';
    if (query === sent.current) return;
    // Typing waits a moment so each letter is not a request; the selects apply at once.
    const timer = setTimeout(
      () => {
        sent.current = query;
        onChange(query);
      },
      text.trim() ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [status, days, text, onChange]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && (
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Search ${noun}`}
            aria-label={`Search ${noun}`}
            maxLength={100}
            className="h-8 pl-8 text-sm"
          />
        </div>
      )}
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Filter ${noun} by status`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">
            Any status
          </SelectItem>
          {statuses.map(([value, label]) => (
            <SelectItem key={value} value={value} className="text-xs">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={days} onValueChange={setDays}>
        <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Filter ${noun} by age`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AGES.map(([value, label]) => (
            <SelectItem key={value} value={value} className="text-xs">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
