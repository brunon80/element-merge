import { Component, type ReactNode } from 'react';

/**
 * Guarda do canvas 3D. O three (r169) exige WebGL2: iPhone com iOS anterior a
 * 15 e WebViews de aplicativo (Chrome iOS antigo, navegador embutido) entregam
 * só WebGL1 — o construtor do renderer JOGA e, sem barreira, o App inteiro
 * some da tela. Aqui a falha vira um aviso legível no lugar da cena.
 */
export class GLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(err: unknown): void {
    console.warn('WebGL2 indisponível neste dispositivo:', err);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="gl-missing" data-testid="gl-missing">
          <h2>3D indisponível</h2>
          <p>
            Este navegador não entrega <strong>WebGL2</strong>. No iPhone, atualize para o
            iOS 15 ou mais novo — e abra o jogo no Safari (navegadores embutidos de
            aplicativo costumam desligar o WebGL2).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
