'use client';

interface TopBarProps {
  panels: { graph: boolean };
  onTogglePanel: (panel: keyof TopBarProps['panels']) => void;
  isEditMode: boolean;
  setIsEditMode: (isEditMode: boolean) => void;
}

export default function TopBar(_props: TopBarProps) {
  return (
    <header className="border-b border-zinc-700 bg-zinc-800 px-4 py-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center" />
        <div className="flex items-center gap-3" />
      </div>
    </header>
  );
}
