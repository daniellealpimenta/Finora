// Avisos do topo que a pessoa fechou (fechamento pronto, banco parado). Cada aviso tem uma chave
// que muda quando o assunto muda (outro ciclo, outra data de parada): aí ele volta a aparecer.
const KEY = "mf_dismissed";

function read(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function isDismissed(key: string) {
  return typeof window !== "undefined" && read().includes(key);
}

export function dismiss(key: string) {
  try {
    // Guarda só os 50 mais recentes: chave velha não volta a valer mesmo
    localStorage.setItem(KEY, JSON.stringify([...read().filter((k) => k !== key), key].slice(-50)));
  } catch {
    /* sem storage: some só até recarregar */
  }
}
