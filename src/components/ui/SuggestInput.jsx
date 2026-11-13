import { useEffect, useId, useRef, useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';

/**
 * A text field that offers suggestions while typing. Unlike the location
 * picker, anything may be typed: the suggestions only help the same thing get
 * spelt the same way each time.
 *
 * `getSuggestions(text)` returns the strings to offer for what is typed.
 */
export default function SuggestInput({
  id,
  name,
  value,
  onChange,
  getSuggestions,
  disabled = false,
  placeholder = '',
  className = 'input',
  hint = 'Used before',
}) {
  const listId = useId();
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  // -1 means nothing is highlighted, so Enter leaves the typed text alone.
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = open && !disabled ? getSuggestions(value) : [];
  // Nothing to offer when the only match is exactly what is already there.
  const visible = suggestions.length === 1 && suggestions[0] === value ? [] : suggestions;
  const showList = visible.length > 0;

  useEffect(() => {
    if (showList && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, showList]);

  const pick = (suggestion) => {
    onChange(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showList) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => {
        if (event.key === 'ArrowDown') return index + 1 >= visible.length ? 0 : index + 1;
        return index <= 0 ? visible.length - 1 : index - 1;
      });
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0 && visible[activeIndex]) {
      event.preventDefault();
      pick(visible[activeIndex]);
    }
  };

  return (
    <>
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={className}
        placeholder={placeholder}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          // Keep focus in the input while an option is tapped, so the blur
          // handler does not close the list before the pick registers.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-20 mt-2 max-h-60 w-full animate-scale-in overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card-hover"
        >
          <li className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400" role="presentation">
            {hint}
          </li>
          {visible.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`${listId}-${index}`}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(suggestion)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                index === activeIndex ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <HistoryIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">{suggestion}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
