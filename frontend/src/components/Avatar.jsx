import React from 'react';

export default function Avatar({ name, size = 32, src, className, style }) {
  const initials = name
    ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  const fontSize = Math.round(size * 0.38);

  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    userSelect: 'none',
    overflow: 'hidden',
    fontWeight: 700,
    fontSize,
    ...style,
  };

  if (src) {
    return (
      <div style={base} className={className}>
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div
      style={{ ...base, background: '#E3DAEF', color: '#2E1A47' }}
      className={className}
      title={name}
    >
      {initials}
    </div>
  );
}
