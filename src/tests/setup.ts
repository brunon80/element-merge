import '@testing-library/jest-dom/vitest';

// ⚠️ Node ≥22 instala um GETTER global `localStorage` (o webstorage experimental
// dele) que devolve `undefined` quando roda sem `--localstorage-file`. No jsdom
// do vitest `window === globalThis === document.defaultView` (sondado), então o
// getter do Node sombreia a janela do jsdom e o `localStorage` fica `undefined`
// em TODOS os caminhos — foi o que derrubou 107 testes de uma vez no Node 26
// (persistência, migração de save, roster, UI...). A casa só usa
// getItem/setItem/removeItem/clear (medido por grep), então devolvemos um
// storage em memória quando o ambiente não entrega um — em Node mais velho, ou
// com --localstorage-file, nada aqui roda.
class MemoryStorage {
  private itens = new Map<string, string>();
  get length() {
    return this.itens.size;
  }
  key(i: number): string | null {
    return [...this.itens.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.itens.has(String(k)) ? (this.itens.get(String(k)) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.itens.set(String(k), String(v));
  }
  removeItem(k: string): void {
    this.itens.delete(String(k));
  }
  clear(): void {
    this.itens.clear();
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
