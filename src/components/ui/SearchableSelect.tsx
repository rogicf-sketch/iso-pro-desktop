import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { labelMatchesSearch } from './searchableSelectUtils';

export type SearchableSelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function SearchableSelect({ label, value, options, onChange, placeholder, disabled }: Props) {
  const reactId = useId();
  const listId = `${reactId}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected?.label ?? '';

  const [query, setQuery] = useState(selected?.label ?? '');
  const syncKey = `${value}\u0001${selectedLabel}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setQuery(selectedLabel);
  }

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    const maxList = 400;
    const qLower = q.toLowerCase();
    let list: SearchableSelectOption[];
    if (!q) {
      list = options.slice(0, maxList);
    } else {
      list = options
        .filter(
          (o) =>
            labelMatchesSearch(o.label, q) ||
            o.value.toLowerCase().includes(qLower) ||
            (value !== '' && o.value === value),
        )
        .slice(0, maxList);
    }
    if (value && selected && !list.some((o) => o.value === value)) {
      list = [selected, ...list.filter((o) => o.value !== value)].slice(0, maxList);
    }
    return list;
  }, [options, query, value, selected]);

  const filteredKey = useMemo(() => filtered.map((o) => o.value).join('\u0001'), [filtered]);
  const [prevFilteredKey, setPrevFilteredKey] = useState(filteredKey);
  if (filteredKey !== prevFilteredKey) {
    setPrevFilteredKey(filteredKey);
    setHighlight(-1);
  }

  function pick(o: SearchableSelectOption) {
    onChange(o.value);
    setQuery(o.label);
    setOpen(false);
    setHighlight(-1);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    if (v === '') onChange('');
  }

  function onBlur() {
    window.setTimeout(() => {
      setOpen(false);
      const t = query.trim().toLowerCase();
      const exact = options.find((o) => o.label.trim().toLowerCase() === t);
      if (exact) {
        if (value !== exact.value) onChange(exact.value);
        setQuery(exact.label);
        return;
      }
      if (value && selected) setQuery(selected.label);
    }, 160);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      pick(filtered[highlight]!);
    }
  }

  return (
    <div className="field autocomplete-field" ref={wrapRef}>
      <span>{label}</span>
      <div className="autocomplete-wrap">
        <input
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
          className="input-control"
          disabled={disabled}
          onBlur={onBlur}
          onChange={onInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          type="text"
          value={query}
        />
        {open && !disabled ? (
          <ul className="autocomplete-list" id={listId} role="listbox">
            {filtered.length === 0 ? (
              <li className="autocomplete-muted">Nenhuma opcao. Ajuste o texto ou cole a linha completa.</li>
            ) : (
              filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    className={`autocomplete-option${i === highlight ? ' is-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(o);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    type="button"
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
