import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || '/api';

export default function Estoque() {
  const { profile } = useAuth();
  const company = profile?.company || '';
  // _t garante que o iframe recarrega o HTML sempre que o componente monta
  const src = `/estoque-final-v4.html?company=${encodeURIComponent(company)}&api=${encodeURIComponent(API)}&_t=${Date.now()}`;
  return (
    <iframe
      src={src}
      title="Estoque"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
    />
  );
}
