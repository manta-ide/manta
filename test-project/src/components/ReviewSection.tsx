import React from "react";
import { useVars } from '../../_graph/varsHmr.ts';

interface Review {
  name: string;
  role: string;
  avatar: string;
  rating: number;
  review: string;
}

export default function ReviewSection() {
  const [vars] = useVars();

  const sectionStyles = (vars["section-styles"] as Record<string, any>) || {};
  const headerContent = (vars["header-content"] as Record<string, any>) || {};
  const headerStyles = (vars["header-styles"] as Record<string, any>) || {};
  const layoutSettings = (vars["layout-settings"] as Record<string, any>) || {};
  const cardStyles = (vars["card-styles"] as Record<string, any>) || {};
  const starStyles = (vars["star-styles"] as Record<string, any>) || {};
  const textStyles = (vars["text-styles"] as Record<string, any>) || {};
  const reviewsData = (vars["reviews-data"] as Review[]) || [];

  const cssVars = {
    "--section-bg-color": sectionStyles["background-color"] ?? "#f8fafc",
    "--section-padding-y": `${sectionStyles["padding-y"] ?? 5}rem`,
    "--section-padding-x": `${sectionStyles["padding-x"] ?? 2}rem`,
    "--title-color": headerStyles["title-color"] ?? "#1e293b",
    "--subtitle-color": headerStyles["subtitle-color"] ?? "#64748b",
    "--title-size": headerStyles["title-size"] ?? "2.5rem",
    "--card-bg-color": cardStyles["background-color"] ?? "#ffffff",
    "--card-border-color": cardStyles["border-color"] ?? "#e2e8f0",
    "--card-border-radius": `${cardStyles["border-radius"] ?? 0.75}rem`,
    "--card-padding": `${cardStyles["padding"] ?? 1.5}rem`,
    "--star-color": starStyles["star-color"] ?? "#fbbf24",
    "--star-size": starStyles["star-size"] ?? "1rem",
    "--review-text-color": textStyles["review-text-color"] ?? "#374151",
    "--name-color": textStyles["name-color"] ?? "#111827",
    "--role-color": textStyles["role-color"] ?? "#6b7280",
    "--review-font-size": textStyles["review-font-size"] ?? "1rem",
    "--gap": `${layoutSettings["gap"] ?? 2}rem`,
  } as React.CSSProperties;

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <svg
          key={i}
          className="inline-block"
          style={{
            width: "var(--star-size)",
            height: "var(--star-size)",
            fill: i <= rating ? "var(--star-color)" : "#d1d5db"
          }}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      );
    }
    return stars;
  };

  const getGridColumns = () => {
    const columns = layoutSettings["columns"] ?? "3";
    switch (columns) {
      case "1": return "grid-cols-1";
      case "2": return "grid-cols-1 md:grid-cols-2";
      case "3": return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
      default: return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    }
  };

  const getShadowClass = () => {
    const shadow = cardStyles["shadow"] ?? "md";
    switch (shadow) {
      case "none": return "";
      case "sm": return "shadow-sm";
      case "md": return "shadow-md";
      case "lg": return "shadow-lg";
      default: return "shadow-md";
    }
  };

  const showHeader = headerContent["show-header"] !== false;
  const showAvatars = layoutSettings["show-avatars"] !== false;
  const showRatings = layoutSettings["show-ratings"] !== false;

  return (
    <section
      id="node-review-section"
      className="w-full"
      style={{
        ...cssVars,
        backgroundColor: "var(--section-bg-color)",
        paddingTop: "var(--section-padding-y)",
        paddingBottom: "var(--section-padding-y)",
        paddingLeft: "var(--section-padding-x)",
        paddingRight: "var(--section-padding-x)",
      }}
    >
      <div className="max-w-7xl mx-auto">
        {showHeader && (
          <div
            className="mb-12"
            style={{
              textAlign: headerStyles["text-align"] as React.CSSProperties['textAlign'] || 'center'
            }}
          >
            <h2
              className="font-bold mb-4"
              style={{
                color: "var(--title-color)",
                fontSize: "var(--title-size)",
              }}
            >
              {headerContent["title"] || "What Our Customers Say"}
            </h2>
            <p
              className="max-w-3xl mx-auto"
              style={{
                color: "var(--subtitle-color)",
              }}
            >
              {headerContent["subtitle"] || "Don't just take our word for it. Here's what our customers have to say about their experience."}
            </p>
          </div>
        )}

        <div
          className={`grid ${getGridColumns()}`}
          style={{ gap: "var(--gap)" }}
        >
          {reviewsData.map((review, index) => (
            <div
              key={index}
              className={`border ${getShadowClass()}`}
              style={{
                backgroundColor: "var(--card-bg-color)",
                borderColor: "var(--card-border-color)",
                borderRadius: "var(--card-border-radius)",
                padding: "var(--card-padding)",
              }}
            >
              <div className="flex flex-col h-full">
                {showRatings && (
                  <div className="flex items-center mb-4">
                    {renderStars(review.rating || 5)}
                  </div>
                )}

                <blockquote
                  className="flex-grow mb-6"
                  style={{
                    color: "var(--review-text-color)",
                    fontSize: "var(--review-font-size)",
                  }}
                >
                  "{review.review || "Great experience with this platform!"}"
                </blockquote>

                <div className="flex items-center">
                  {showAvatars && review.avatar && (
                    <img
                      src={review.avatar}
                      alt={review.name || "Customer"}
                      className="w-12 h-12 rounded-full mr-4 object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  )}
                  <div>
                    <div
                      className="font-semibold"
                      style={{ color: "var(--name-color)" }}
                    >
                      {review.name || "Anonymous Customer"}
                    </div>
                    {review.role && (
                      <div
                        className="text-sm"
                        style={{ color: "var(--role-color)" }}
                      >
                        {review.role}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}