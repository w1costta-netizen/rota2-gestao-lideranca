import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const EMOJIS = ['👍', '✅', '❤️', '😮', '🎯'];

function Popover({ emoji, tipo, itemId, onClose }) {
  const [nomes, setNomes] = useState(null);
  const ref = useRef();

  useEffect(() => {
    api.get(`/reacoes/quem?tipo=${tipo}&item_id=${itemId}&emoji=${encodeURIComponent(emoji)}`)
      .then(r => setNomes(r.data))
      .catch(() => setNomes([]));
  }, [tipo, itemId, emoji]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
      background: 'var(--surface-high, #1e1e2e)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', zIndex: 999,
      minWidth: 140, maxWidth: 220, boxShadow: '0 4px 20px rgba(0,0,0,.35)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
        {emoji} Reações
      </div>
      {nomes === null ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando...</div>
      ) : nomes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma reação ainda</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {nomes.map((nome, i) => (
            <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 0' }}>
              {nome}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReacaoBar({ itemId, userId, tipo, reacoes, onToggle, stopPropagation }) {
  const [popover, setPopover]       = useState(null);
  // emoji aguardando confirmação de remoção (primeiro clique no emoji já selecionado)
  const [confirming, setConfirming] = useState(null);
  const confirmTimer = useRef(null);

  const stop = e => { if (stopPropagation) e.stopPropagation(); };

  const handleReacao = (e, emoji) => {
    stop(e);
    setPopover(null);

    const mine = reacoes?.[emoji]?.mine;

    if (mine) {
      if (confirming === emoji) {
        // Segundo clique no mesmo emoji → remove
        clearTimeout(confirmTimer.current);
        setConfirming(null);
        onToggle(itemId, emoji);
      } else {
        // Primeiro clique no emoji já selecionado → pede confirmação
        clearTimeout(confirmTimer.current);
        setConfirming(emoji);
        confirmTimer.current = setTimeout(() => setConfirming(null), 2500);
      }
    } else {
      // Clique em emoji diferente → troca
      clearTimeout(confirmTimer.current);
      setConfirming(null);
      onToggle(itemId, emoji);
    }
  };

  const handleCount = (e, emoji) => {
    e.stopPropagation();
    setPopover(prev => prev === emoji ? null : emoji);
  };

  // Limpa timer ao desmontar
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 10 }}
      onClick={stop}>
      {EMOJIS.map(emoji => {
        const info  = reacoes?.[emoji];
        const count = info?.count || 0;
        const mine  = info?.mine  || false;
        const isConfirming = confirming === emoji;

        return (
          <div key={emoji} style={{ position: 'relative' }}>
            {popover === emoji && (
              <Popover emoji={emoji} tipo={tipo} itemId={itemId} onClose={() => setPopover(null)} />
            )}

            {/* Tooltip "clique para remover" */}
            {isConfirming && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                transform: 'translateX(-50%)', whiteSpace: 'nowrap',
                background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 600,
                padding: '3px 8px', borderRadius: 6, zIndex: 998,
                pointerEvents: 'none',
              }}>
                Clique de novo para remover
              </div>
            )}

            <div style={{
              display: 'flex', alignItems: 'center',
              border: isConfirming
                ? '1.5px solid #ef4444'
                : mine ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
              borderRadius: 20, overflow: 'hidden',
              background: isConfirming
                ? 'rgba(239,68,68,.12)'
                : mine ? 'var(--primary-subtle, rgba(99,102,241,.12))' : 'transparent',
              transition: 'all .2s',
            }}>
              <button
                onClick={e => handleReacao(e, emoji)}
                title={mine ? (isConfirming ? 'Clique para remover' : 'Clique novamente para remover') : 'Reagir'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: count > 0 ? '4px 6px 4px 10px' : '4px 10px',
                  fontSize: 13, cursor: 'pointer', background: 'transparent',
                  border: 'none',
                  color: isConfirming ? '#ef4444' : mine ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: mine ? 700 : 400,
                }}>
                <span>{emoji}</span>
              </button>

              {count > 0 && (
                <button
                  onClick={e => handleCount(e, emoji)}
                  title="Ver quem reagiu"
                  style={{
                    padding: '4px 10px 4px 2px', fontSize: 11,
                    cursor: 'pointer', background: 'transparent', border: 'none',
                    color: isConfirming ? '#ef4444' : mine ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: mine ? 700 : 500,
                    borderLeft: '1px solid var(--border)',
                  }}>
                  {count}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
