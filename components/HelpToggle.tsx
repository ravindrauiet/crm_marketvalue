"use client";
import { useEffect, useState } from 'react';
import Icon from './Icon';

const STORAGE_KEY = 'glomin.help';

/** Shows/hides every `.help-only` / `.help-text` element via `html[data-help]`. Explanations are on by default. */
export default function HelpToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
    apply(saved !== 'off', false);
  }, []);

  function apply(next: boolean, persist = true) {
    setOn(next);
    document.documentElement.dataset.help = next ? 'on' : 'off';
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch {}
    }
  }

  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => apply(!on)}
      aria-pressed={on}
      title={on ? 'Hide the explanations and the getting-started guide' : 'Show what each section means'}
    >
      <Icon name="help" size={16} />
      {on ? 'Hide explanations' : 'Show explanations'}
    </button>
  );
}
