import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, MessageCircle, Mail, ChevronDown } from 'lucide-react';

/**
 * ExportMenu — botão com dropdown de 4 opções de exportação
 *
 * Props:
 *   onPDF()      — gera e baixa o PDF
 *   onExcel()    — gera e baixa o Excel
 *   onWhatsApp() — abre WhatsApp com resumo em texto
 *   onEmail()    — abre cliente de email com resumo
 *   label        — texto do botão (padrão: "Exportar")
 *   disabled     — desabilita o botão
 */
export default function ExportMenu({ onPDF, onExcel, onWhatsApp, onEmail, label = 'Exportar', disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const opcoes = [
    { icon: <FileText size={15} />,        label: 'Baixar PDF',       cor: '#ef4444', fn: onPDF,       show: !!onPDF },
    { icon: <FileSpreadsheet size={15} />, label: 'Baixar Excel',     cor: '#10b981', fn: onExcel,     show: !!onExcel },
    { icon: <MessageCircle size={15} />,   label: 'Enviar WhatsApp',  cor: '#25D366', fn: onWhatsApp,  show: !!onWhatsApp },
    { icon: <Mail size={15} />,            label: 'Enviar por Email', cor: '#3b82f6', fn: onEmail,     show: !!onEmail },
  ].filter(o => o.show);

  const handle = fn => { setOpen(false); fn?.(); };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: disabled ? 'var(--surface)' : '#e8681a',
          color: disabled ? 'var(--text-muted)' : '#fff',
          border: 'none', borderRadius: 8, padding: '8px 14px',
          fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? .5 : 1, transition: 'background .15s',
        }}
      >
        <Download size={15} />
        {label}
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          minWidth: 190, overflow: 'hidden',
        }}>
          {opcoes.map(op => (
            <button
              key={op.label}
              onClick={() => handle(op.fn)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', background: 'none', border: 'none',
                padding: '11px 16px', cursor: 'pointer', fontSize: 13,
                color: 'var(--text)', textAlign: 'left',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--background)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ color: op.cor }}>{op.icon}</span>
              {op.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
