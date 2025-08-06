'use client';
import React, { useState } from 'react';
import Image, { StaticImageData } from 'next/image';

export interface ProjectCardProps {
  /** Project thumbnail, either a StaticImageData import or external URL */
  image: StaticImageData | string;
  /** Name of the project */
  title: string;
  /** Brief summary of the project */
  description: string;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ image, title, description }) => {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative w-full h-48 sm:h-56">

      </div>

      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2" title={title}>
          {title}
        </h3>
        <p className="text-gray-700 text-sm">{description}</p>
      </div>
    </div>
  );
};

export default ProjectCard;
