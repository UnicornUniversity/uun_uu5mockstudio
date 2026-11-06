/**
 * The part of the page-side scripts that finds the tagged component (the JSX element of the file) behind a DOM node: the React fiber tree is
 * walked from the node up to the nearest fiber that carries `data-uu5-src`. Shared by the inspector (INJECT) and the drop target (DROP_INJECT).
 */
export const FIBER = `const SRC = "data-uu5-src";
const fiberOf = (el) => { for (let n = el; n; n = n.parentElement) { const k = Object.keys(n).find((x) => x.startsWith("__reactFiber$")); if (k) return n[k]; } return null; };
  const ordOf = (f) => { const v = f.memoizedProps ? f.memoizedProps[SRC] : undefined; return v === undefined || v === null ? null : Number(v); };
  const compAt = (el) => { for (let f = fiberOf(el); f; f = f.return) { if (ordOf(f) !== null) return f; } return null; };
  const hostNodes = (f, out = []) => { for (let c = f.child; c; c = c.sibling) { if (c.tag === 5 && c.stateNode instanceof Element) out.push(c.stateNode); else hostNodes(c, out); } return out; };
  // a plain element (a <div>) is its own box: the union of its children would also take in the parts that stick out of it (an absolutely positioned child clipped by overflow:hidden)
  const rectOf = (f) => {
    const nodes = f.tag === 5 && f.stateNode instanceof Element ? [f.stateNode] : hostNodes(f);
    const rs = nodes.map((n) => n.getBoundingClientRect()).filter((r) => r.width || r.height);
    if (!rs.length) return null;
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    return { left: l, top: t, width: Math.max(...rs.map((r) => r.right)) - l, height: Math.max(...rs.map((r) => r.bottom)) - t };
  };
  const publicName = (f) => { const t = f.type, n = typeof t === "string" ? "" : (t && (t.displayName || t.name)) || ""; const m = String(n).match(/((?:Uu5|Plus4U5)[A-Za-z0-9]*\\.[A-Z][\\w.]*)\\)*$/); return m ? m[1] : null; };
  const outermost = (T0) => { let T = T0; const ord = ordOf(T0); for (let g = T0.return; g; g = g.return) { const o = ordOf(g); if (o === null) continue; if (o === ord) T = g; else break; } return T; };`;
