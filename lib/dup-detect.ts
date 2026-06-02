/**
 * Detección de leads duplicados.
 * Criterios:
 *  - Mismo telefono_normalizado
 *  - Mismo email (case-insensitive)
 *  - Mismo instagram (sin @)
 *  - Nombre con Levenshtein <= 2 sobre ≥ 4 chars
 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const m: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) m[i][0] = i;
  for (let j = 0; j <= bl; j++) m[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + c);
    }
  }
  return m[al][bl];
}

function normName(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function normIG(s: string | null): string {
  return String(s || "").toLowerCase().replace(/^@/, "").trim();
}

export interface LeadForDup {
  id: string;
  nombre: string | null;
  telefono_normalizado: string | null;
  email: string | null;
  instagram: string | null;
  created_at?: string;
}

export interface DupGroup {
  key: string;
  motivo: "telefono" | "email" | "instagram" | "nombre_similar";
  leads: LeadForDup[];
}

export function detectDuplicates(leads: LeadForDup[]): DupGroup[] {
  const groups: DupGroup[] = [];
  const grouped = new Set<string>();

  // 1. Teléfono normalizado
  const byTel = new Map<string, LeadForDup[]>();
  for (const l of leads) {
    if (!l.telefono_normalizado || l.telefono_normalizado.length < 7) continue;
    if (!byTel.has(l.telefono_normalizado)) byTel.set(l.telefono_normalizado, []);
    byTel.get(l.telefono_normalizado)!.push(l);
  }
  for (const [tel, arr] of byTel) {
    if (arr.length >= 2) {
      groups.push({ key: "tel:" + tel, motivo: "telefono", leads: arr });
      arr.forEach((l) => grouped.add(l.id));
    }
  }

  // 2. Email
  const byEmail = new Map<string, LeadForDup[]>();
  for (const l of leads) {
    const e = (l.email || "").toLowerCase().trim();
    if (!e || !e.includes("@")) continue;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e)!.push(l);
  }
  for (const [em, arr] of byEmail) {
    if (arr.length >= 2 && !arr.every((l) => grouped.has(l.id))) {
      groups.push({ key: "email:" + em, motivo: "email", leads: arr });
      arr.forEach((l) => grouped.add(l.id));
    }
  }

  // 3. Instagram
  const byIG = new Map<string, LeadForDup[]>();
  for (const l of leads) {
    const ig = normIG(l.instagram);
    if (!ig || ig.length < 3) continue;
    if (!byIG.has(ig)) byIG.set(ig, []);
    byIG.get(ig)!.push(l);
  }
  for (const [ig, arr] of byIG) {
    if (arr.length >= 2 && !arr.every((l) => grouped.has(l.id))) {
      groups.push({ key: "ig:" + ig, motivo: "instagram", leads: arr });
      arr.forEach((l) => grouped.add(l.id));
    }
  }

  // 4. Nombre similar (Levenshtein <= 2, ambos ≥ 4 chars).
  //    Solo para los leads que no entraron en grupos previos.
  const restantes = leads.filter((l) => !grouped.has(l.id) && l.nombre && normName(l.nombre).length >= 4);
  const visitados = new Set<string>();
  for (let i = 0; i < restantes.length; i++) {
    if (visitados.has(restantes[i].id)) continue;
    const baseName = normName(restantes[i].nombre!);
    const cluster: LeadForDup[] = [restantes[i]];
    for (let j = i + 1; j < restantes.length; j++) {
      if (visitados.has(restantes[j].id)) continue;
      const oName = normName(restantes[j].nombre!);
      const minLen = Math.min(baseName.length, oName.length);
      const maxAllowed = minLen <= 6 ? 1 : 2;
      if (levenshtein(baseName, oName) <= maxAllowed) {
        cluster.push(restantes[j]);
        visitados.add(restantes[j].id);
      }
    }
    if (cluster.length >= 2) {
      groups.push({ key: "name:" + baseName, motivo: "nombre_similar", leads: cluster });
      cluster.forEach((l) => grouped.add(l.id));
    }
    visitados.add(restantes[i].id);
  }

  return groups;
}
