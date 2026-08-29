import React from 'react';
import { reportError } from '../lib/reportError';
import { ehErroDeVersaoAntiga, recarregarPorVersaoNova } from '../lib/appUpdate';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, atualizando: false };
  }

  static getDerivedStateFromError(error) {
    // Versão nova no ar: em vez da tela de erro, mostra "atualizando" —
    // o recarregamento é disparado no componentDidCatch logo abaixo.
    if (ehErroDeVersaoAntiga(error)) return { error, atualizando: true };
    return { error, atualizando: false };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);

    if (ehErroDeVersaoAntiga(error)) {
      // Se o recarregamento não puder acontecer (já tentou há pouco), cai
      // para a tela de erro normal em vez de ficar preso em "atualizando".
      if (!recarregarPorVersaoNova()) this.setState({ atualizando: false });
      return;
    }

    // Registra a quebra de tela no log de auditoria — antes esse tipo de erro
    // só existia no console do navegador do usuário.
    reportError({
      userId: this.props.userId,
      acao: 'erro_tela',
      erro: error,
    });
  }

  render() {
    if (this.state.atualizando) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: 14, padding: 24,
          textAlign: 'center',
        }}>
          <span style={{ fontSize: 40 }}>🔄</span>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Atualizando o app...
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 320 }}>
            Uma versão nova acabou de sair. Só um instante.
          </p>
        </div>
      );
    }

    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 24,
          textAlign: 'center',
        }}>
          <span style={{ fontSize: 48 }}>⚠️</span>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Algo deu errado
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 320 }}>
            {this.state.error?.message || 'Erro inesperado nesta tela.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={() => this.setState({ error: null, atualizando: false })}
            >
              Tentar novamente
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => window.location.reload()}
            >
              Recarregar app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
