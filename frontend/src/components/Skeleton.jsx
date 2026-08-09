import React from 'react';

export function Skeleton({ width, height = 14, borderRadius = 8, className = '', style }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-icon" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-text" style={{ width: '80%' }} />
        <div className="skeleton skeleton-text" style={{ width: '50%', marginBottom: 0 }} />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 0 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div className="skeleton" style={{ height: 10, width: '60%', borderRadius: 4 }} />
          </div>
        ))}
        {Array.from({ length: rows * cols }).map((_, i) => (
          <div key={i} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div className="skeleton" style={{ height: 13, borderRadius: 4, opacity: i % cols === 0 ? 1 : 0.6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
