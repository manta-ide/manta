import Image from 'next/image';
import type { FC } from 'react';

export interface ProjectCardProps {
  /** The project name */
  title: string;
  /** A brief summary of the project */
  description: string;
  /** Source URL or path for the project thumbnail image */
  image: string;
}

/**
 * ProjectCard
 *
 * A card component that displays project details including a thumbnail image,
 * title, and a brief description. Designed responsively with Tailwind CSS.
 */
const ProjectCard: FC<ProjectCardProps> = ({ title, description, image }) => {
  return (
    <article className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-200">
      <div className="relative w-full h-48 sm:h-56 lg:h-64">
        {/* <Image
          src={image}
          alt={`${title} thumbnail`}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        /> */}
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2 text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </article>
  );
};

export default ProjectCard;
