import varsJson from "../../_graph/vars.json";

export type Vars = typeof varsJson;

export function subscribeVars(onUpdate: (vars: Vars) => void) {
  if (import.meta.hot) {
    import.meta.hot.accept("../../_graph/vars.json", (mod) => {
      const next = (mod as any)?.default as Vars | undefined;
      if (next) onUpdate(next);
    });
  }
}

export function getInitialVars(): Vars {
  return varsJson as Vars;
}


