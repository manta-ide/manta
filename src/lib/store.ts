import { create } from 'zustand';

interface CodeStore {
  code: string;
  setCode: (code: string) => void;
  selection: { x: number; y: number; width: number; height: number } | null;
  setSelection: (selection: { x: number; y: number; width: number; height: number } | null) => void;
}

const initialCode = `
function Counter() {
  const [count, setCount] = React.useState(0);

  return (
    <div>
      <h2 style={{ color: 'blue' }}>Counter</h2>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
`;

export const useCodeStore = create<CodeStore>((set) => ({
  code: initialCode.trim(),
  setCode: (code) => set({ code }),
  selection: null,
  setSelection: (selection) => set({ selection }),
})); 