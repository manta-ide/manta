'use client';

import { useVars } from "../../.manta/varsHmr";

interface TopBarProps {
  panels: { graph: boolean };
  onTogglePanel: (panel: keyof TopBarProps['panels']) => void;
  isEditMode: boolean;
  setIsEditMode: (isEditMode: boolean) => void;
}

export default function TopBar(_props: TopBarProps) {
  const [vars] = useVars();

  // Wire CMS properties from topbar-component node
  const headerStyles = (vars["header-styles"] as Record<string, any>) || {};
  const layoutSettings = (vars["layout-settings"] as Record<string, any>) || {};
  const componentBehavior = (vars["component-behavior"] as Record<string, any>) || {};

  const dynamicStyles = {
    "--bg-color": headerStyles["background-color"] ?? "#27272a",
    "--border-color": headerStyles["border-color"] ?? "#3f3f46",
    "--border-width": `${headerStyles["border-width"] ?? 1}px`,
    "--padding-x": `${headerStyles["padding-x"] ?? 16}px`,
    "--padding-y": `${headerStyles["padding-y"] ?? 6}px`,
    "--justify-content": layoutSettings["justify-content"] ?? "space-between",
    "--align-items": layoutSettings["align-items"] ?? "center",
    "--gap": `${layoutSettings["gap"] ?? 12}px`,
    "--z-index": componentBehavior["z-index"] ?? 10,
  } as React.CSSProperties;

  const positionClass = componentBehavior["fixed-position"]
    ? "fixed top-0 left-0 right-0"
    : componentBehavior["sticky"]
    ? "sticky top-0"
    : "";
console.log(dynamicStyles);
  return (
    <header
      className={`border-b ${positionClass}`}
      style={{
        ...dynamicStyles,
        backgroundColor: "var(--bg-color)",
        borderColor: "var(--border-color)",
        borderWidth: "var(--border-width)",
        paddingLeft: "var(--padding-x)",
        paddingRight: "var(--padding-x)",
        paddingTop: "var(--padding-y)",
        paddingBottom: "var(--padding-y)",
        zIndex: "var(--z-index)",
      }}
    >
      <div
        className="flex"
        style={{
          justifyContent: "var(--justify-content)",
          alignItems: "var(--align-items)",
          gap: "var(--gap)",
        }}
      >
        <div className="flex items-center" />
        <div className="flex items-center gap-3" />
      </div>
    </header>
  );
}
