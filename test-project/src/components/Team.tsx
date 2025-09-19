import React from "react";
import { useVars } from '../../_graph/varsHmr.ts';

interface TeamMember {
  name: string;
  role: string;
  photo: string;
  experience: string;
  bio: string;
}

export default function Team() {
  const [vars] = useVars();
  const nodeId = 'node-1758263161465660';

  // Extract properties from the graph
  const sectionTitle = vars[`${nodeId}-section-title`] as string || vars["section-title"] as string || "Our Founding Team";
  const sectionSubtitle = vars["section-subtitle"] as string || "Meet the passionate individuals who started this journey";
  const teamMembers = (vars["team-members"] as TeamMember[]) || [];
  const layoutStyle = vars["layout-style"] as string || "grid";
  const columnsPerRow = vars["columns-per-row"] as number || 3;
  const photoStyle = vars["photo-style"] as string || "circle";
  const photoSize = vars["photo-size"] as string || "large";
  const textAlignment = vars["text-alignment"] as string || "center";
  const showExperience = vars["show-experience"] as boolean ?? true;
  const showBio = vars["show-bio"] as boolean ?? true;

  const sectionStyles = (vars[`${nodeId}-section-styles`] as Record<string, any>) || (vars["section-styles"] as Record<string, any>) || {};
  const titleStyles = (vars["title-styles"] as Record<string, any>) || {};
  const cardStyles = (vars[`${nodeId}-card-styles`] as Record<string, any>) || (vars["card-styles"] as Record<string, any>) || {};

  // Generate CSS variables
  const cssVars = {
    "--section-bg": sectionStyles["background-color"] ?? "#ffffff",
    "--section-text-color": sectionStyles["text-color"] ?? "#1f2937",
    "--section-padding": sectionStyles["padding"] ?? "4rem 1rem",
    "--title-font-size": titleStyles["font-size"] ?? "2.5rem",
    "--title-font-weight": titleStyles["font-weight"] ?? "bold",
    "--title-color": titleStyles["color"] ?? "#1f2937",
    "--title-margin-bottom": titleStyles["margin-bottom"] ?? "1rem",
    "--card-bg": cardStyles["background-color"] ?? "#f9fafb",
    "--card-border-radius": cardStyles["border-radius"] ?? "0.75rem",
    "--card-padding": cardStyles["padding"] ?? "2rem",
  } as React.CSSProperties;

  // Determine photo size classes
  const getPhotoSizeClass = () => {
    switch (photoSize) {
      case "small": return "w-16 h-16";
      case "medium": return "w-24 h-24";
      case "large": return "w-32 h-32";
      default: return "w-32 h-32";
    }
  };

  // Determine photo style classes
  const getPhotoStyleClass = () => {
    switch (photoStyle) {
      case "circle": return "rounded-full";
      case "rounded": return "rounded-lg";
      case "square": return "rounded-none";
      default: return "rounded-full";
    }
  };

  // Determine layout classes
  const getLayoutClasses = () => {
    if (layoutStyle === "horizontal") {
      return "flex flex-wrap justify-center gap-8";
    } else if (layoutStyle === "vertical") {
      return "flex flex-col items-center gap-8 max-w-2xl mx-auto";
    } else {
      // grid layout
      const gridCols = {
        1: "grid-cols-1",
        2: "grid-cols-1 md:grid-cols-2",
        3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
        4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      };
      return `grid ${gridCols[columnsPerRow as keyof typeof gridCols] || gridCols[3]} gap-8`;
    }
  };

  // Determine text alignment classes
  const getTextAlignClass = () => {
    switch (textAlignment) {
      case "left": return "text-left";
      case "center": return "text-center";
      case "right": return "text-right";
      default: return "text-center";
    }
  };

  // Generate shadow class
  const getShadowClass = () => {
    const shadow = cardStyles["shadow"] ?? "lg";
    const shadowMap = {
      "none": "",
      "sm": "shadow-sm",
      "md": "shadow-md",
      "lg": "shadow-lg",
      "xl": "shadow-xl"
    };
    return shadowMap[shadow as keyof typeof shadowMap] || "shadow-lg";
  };

  const hoverTransformClass = cardStyles["hover-transform"] ? "hover:transform hover:scale-105 transition-transform duration-200" : "";

  return (
    <section
      id="node-1758263161465660"
      style={{
        ...cssVars,
        backgroundColor: "var(--section-bg)",
        color: "var(--section-text-color)",
        padding: "var(--section-padding)",
      }}
      className="w-full"
    >
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className={`mb-12 ${getTextAlignClass()}`}>
          <h2
            style={{
              fontSize: "var(--title-font-size)",
              fontWeight: "var(--title-font-weight)",
              color: "var(--title-color)",
              marginBottom: "var(--title-margin-bottom)",
            }}
            className="leading-tight"
          >
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="text-lg opacity-80 max-w-3xl mx-auto">
              {sectionSubtitle}
            </p>
          )}
        </div>

        {/* Team Members */}
        <div className={getLayoutClasses()}>
          {teamMembers.map((member, index) => (
            <div
              key={index}
              style={{
                backgroundColor: "var(--card-bg)",
                borderRadius: "var(--card-border-radius)",
                padding: "var(--card-padding)",
              }}
              className={`${getShadowClass()} ${hoverTransformClass} ${getTextAlignClass()}`}
            >
              {/* Photo */}
              <div className="mb-4 flex justify-center">
                <img
                  src={member.photo}
                  alt={member.name}
                  className={`${getPhotoSizeClass()} ${getPhotoStyleClass()} object-cover`}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=667eea&color=fff&size=200`;
                  }}
                />
              </div>

              {/* Name and Role */}
              <div className="mb-3">
                <h3 className="text-xl font-semibold mb-1">
                  {member.name}
                </h3>
                <p className="text-sm font-medium text-blue-600">
                  {member.role}
                </p>
              </div>

              {/* Experience */}
              {showExperience && member.experience && (
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-600">
                    {member.experience}
                  </p>
                </div>
              )}

              {/* Bio */}
              {showBio && member.bio && (
                <div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {member.bio}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {teamMembers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No team members added yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}