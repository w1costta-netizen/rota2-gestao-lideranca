import React from 'react';

export default function Avatar({ name, avatarUrl, size = 28, style = {} }) {
  const initial = (name || '?').trim()[0].toUpperCase();
  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: '2px solid white',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: Math.max(10, Math.round(size * 0.38)),
    fontWeight: 700,
    background: '#E8681A',
    color: '#fff',
    ...style,
  };

  if (avatarUrl) {
    return (
      <div style={base}>
        <img
          src={avatarUrl}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>
    );
  }

  return <div style={base}>{initial}</div>;
}
