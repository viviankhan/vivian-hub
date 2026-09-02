// src/components/ColorPickRow.jsx
// A compact color row used by the wellness emotion + condition pickers: the
// curated preset swatches followed by a custom-color wheel so any color can be
// chosen, not just the presets. Shared by the day-rail and the Wellness tab so
// both interfaces offer the exact same choice.
const eq = (a, b) => (a || '').toUpperCase() === (b || '').toUpperCase()

export default function ColorPickRow({ colors = [], value, onChange }) {
  // The wheel lights up (and shows the chosen color) when the current value is
  // something the user mixed rather than one of the presets.
  const isCustom = !!value && !colors.some(c => eq(c, value))
  return (
    <div className="cpick">
      {colors.map(c => (
        <button key={c} type="button" className={`cpick-sw ${eq(value, c) ? 'on' : ''}`}
          style={{ background: c }} onClick={() => onChange(c)} aria-label={`Colour ${c}`} />
      ))}
      <label className={`cpick-wheel ${isCustom ? 'on' : ''}`} title="Custom color"
        style={isCustom ? { background: value } : undefined}>
        <input type="color" value={value || '#7C9CBF'} onChange={e => onChange(e.target.value)} />
      </label>
    </div>
  )
}
