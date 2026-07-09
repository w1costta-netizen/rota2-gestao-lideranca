import React from 'react';

const ALL_DAYS = [
  { value: 'segunda', label: 'Seg' },
  { value: 'terca',   label: 'Ter' },
  { value: 'quarta',  label: 'Qua' },
  { value: 'quinta',  label: 'Qui' },
  { value: 'sexta',   label: 'Sex' },
  { value: 'sabado',  label: 'Sáb' },
  { value: 'domingo', label: 'Dom' },
];

export default function DaysSelector({ value = [], onChange }) {
  const toggle = (day) => {
    if (value.includes(day)) onChange(value.filter(d => d !== day));
    else onChange([...value, day]);
  };

  return (
    <div className="days-grid">
      {ALL_DAYS.map(d => (
        <button
          key={d.value}
          type="button"
          className={`day-chip${value.includes(d.value) ? ' selected' : ''}`}
          onClick={() => toggle(d.value)}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
