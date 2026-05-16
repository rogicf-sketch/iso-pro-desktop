import { useCallback, useEffect, useId, useRef, useState } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Retorna textos sugeridos conforme o que o usuario digitou (use cadastros ativos). */
  fetchOptions: (query: string) => Promise<string[]>;
  placeholder?: string;
  /** Mensagem quando a busca nao retorna sugestoes (ex.: avisar que o valor deve existir no cadastro). */
  emptySuggestionsMessage?: string;
  disabled?: boolean;
  id?: string;
};

export function AutocompleteField({
  label,
  value,
  onChange,
  fetchOptions,
  placeholder,
  emptySuggestionsMessage,
  disabled,
  id: idProp,
}: Props) {
  const emptyHint =
    emptySuggestionsMessage ??
    'Nenhum cadastro encontrado. Voce pode digitar livremente.';
  const reactId = useId();
  const listId = `${reactId}-list`;
  const inputId = idProp ?? `${reactId}-input`;
  const wrapRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const opts = await fetchOptions(q);
        setSuggestions([...new Set(opts)].slice(0, 50));
      } finally {
        setLoading(false);
      }
    },
    [fetchOptions],
  );

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      void load(value);
    }, 180);
    return () => window.clearTimeout(id);
  }, [value, open, load]);

  useEffect(() => {
    setHighlight(-1);
  }, [suggestions]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function selectOption(s: string) {
    onChange(s);
    setOpen(false);
    setHighlight(-1);
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
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      selectOption(suggestions[highlight]!);
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
          id={inputId}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={value}
        />
        {open ? (
          <ul className="autocomplete-list" id={listId} role="listbox">
            {loading ? <li className="autocomplete-muted">Carregando...</li> : null}
            {!loading && suggestions.length === 0 ? <li className="autocomplete-muted">{emptyHint}</li> : null}
            {!loading &&
              suggestions.map((s, i) => (
                <li key={`${s}-${i}`}>
                  <button
                    className={`autocomplete-option${i === highlight ? ' is-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectOption(s);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    type="button"
                  >
                    {s}
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
