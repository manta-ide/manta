import React from "react";
import { Card, CardContent } from "./ui/card";

interface Review {
  id: string;
  user: {
    name: string;
    avatar?: string;
  };
  rating: number;
  comment: string;
  source: string;
}

interface UserReviewsSectionProps {
  vars: Record<string, any>;
}

// Mock reviews data
const mockReviews: Review[] = [
  {
    id: "1",
    user: { name: "Sarah Johnson", avatar: "SJ" },
    rating: 5,
    comment: "Amazing product! It has completely transformed how I work. Highly recommended to anyone looking for a reliable solution.",
    source: "internal"
  },
  {
    id: "2",
    user: { name: "Mike Chen", avatar: "MC" },
    rating: 4,
    comment: "Great experience overall. The interface is intuitive and the features are exactly what I needed.",
    source: "google"
  },
  {
    id: "3",
    user: { name: "Emma Davis", avatar: "ED" },
    rating: 5,
    comment: "Outstanding customer service and a fantastic product. I've been using it for months now and it never disappoints.",
    source: "trustpilot"
  },
  {
    id: "4",
    user: { name: "Alex Rodriguez", avatar: "AR" },
    rating: 4,
    comment: "Solid product with great value for money. The team behind it clearly knows what they're doing.",
    source: "internal"
  },
  {
    id: "5",
    user: { name: "Lisa Park", avatar: "LP" },
    rating: 5,
    comment: "I was skeptical at first, but this exceeded all my expectations. It's become an essential part of my daily workflow.",
    source: "google"
  },
  {
    id: "6",
    user: { name: "David Wilson", avatar: "DW" },
    rating: 4,
    comment: "Well-designed and feature-rich. The learning curve was minimal and I was productive right away.",
    source: "mixed"
  }
];

export default function UserReviewsSection({ vars }: UserReviewsSectionProps) {
  const sectionTitle = vars["section-title"] || "What Our Users Say";
  const reviewLayout = vars["review-layout"] || "grid";
  const maxReviews = vars["max-reviews"] || 6;
  const showRatings = vars["show-ratings"] !== false;
  const showAvatars = vars["show-avatars"] !== false;

  const reviews = mockReviews.slice(0, maxReviews);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={`text-lg ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`}>
        ★
      </span>
    ));
  };

  const renderAvatar = (user: Review['user']) => {
    if (!showAvatars) return null;

    return (
      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm mr-3">
        {user.avatar || user.name.split(' ').map(n => n[0]).join('')}
      </div>
    );
  };

  const getLayoutClasses = () => {
    switch (reviewLayout) {
      case "grid":
        return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
      case "list":
        return "space-y-6";
      case "carousel":
        return "flex overflow-x-auto space-x-6 pb-4";
      default:
        return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
    }
  };

  return (
    <section className="py-16 px-4 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          {sectionTitle}
        </h2>
        <p className="text-lg text-gray-600">
          Don't just take our word for it - hear from our satisfied users
        </p>
      </div>

      <div className={getLayoutClasses()}>
        {reviews.map((review) => (
          <Card key={review.id} className="h-full">
            <CardContent className="p-6">
              <div className="flex items-start mb-4">
                {renderAvatar(review.user)}
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {review.user.name}
                  </h4>
                  {showRatings && (
                    <div className="flex items-center mb-2">
                      {renderStars(review.rating)}
                      <span className="ml-2 text-sm text-gray-600">
                        {review.rating}/5
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-gray-700 leading-relaxed mb-4">
                "{review.comment}"
              </p>

              <div className="text-xs text-gray-500 uppercase tracking-wide">
                {review.source} Review
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}