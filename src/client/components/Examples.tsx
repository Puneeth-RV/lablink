interface Props {
  label: string;
  examples: string[];
  onPick: (text: string) => void;
}

/** One-click sample inputs, so first-time users (and demos) can try a feature without typing. */
export function Examples({ label, examples, onPick }: Props) {
  return (
    <div className="examples" role="group" aria-label={label}>
      <span className="muted small">Try an example:</span>
      {examples.map((text) => (
        <button key={text} type="button" className="example-chip" onClick={() => onPick(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}
