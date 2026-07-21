import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
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
              onClick={() => this.setState({ error: null })}
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
