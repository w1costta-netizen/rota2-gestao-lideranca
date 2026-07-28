import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || '/api';

export default function Estoque() {
  const { effectiveProfile } = useAuth();
  const company = effectiveProfile?.company || '';
  const src = `/estoque-final-v4.html?company=${encodeURIComponent(company)}&api=${encodeURIComponent(API)}`;
  return (
    <iframe
      src={src}
      title="Estoque"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
    />
  );
}
