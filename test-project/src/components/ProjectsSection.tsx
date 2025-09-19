import React, { useState, useEffect } from 'react';
import { useVars } from '../../_graph/varsHmr';

interface Technology {
  name: string;
}

interface Project {
  title: string;
  description: string;
  image: string;
  link: string;
  technologies: Technology[];
}

interface CarouselSettings {
  autoplay: boolean;
  autoplayDelay: number;
  showDots: boolean;
  showArrows: boolean;
  slidesToShow: number;
  slidesToScroll: number;
}

interface SectionStyles {
  backgroundColor: string;
  textColor: string;
  titleColor: string;
  padding: string;
}

interface CardStyles {
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  borderRadius: string;
  hoverScale: number;
}

interface ButtonStyles {
  buttonColor: string;
  buttonTextColor: string;
  buttonHoverColor: string;
  buttonText: string;
}

export default function ProjectsSection() {
  const [vars] = useVars();
  const nodeId = 'node-1758263116699231';

  // Get properties from the graph
  const sectionTitle = vars[`${nodeId}.section-title`] as string || vars['section-title'] as string || 'Our Projects';
  const sectionDescription = vars[`${nodeId}.section-description`] as string || vars['section-description'] as string || 'Explore our latest work and innovative solutions';
  const projects = vars[`${nodeId}.projects`] as Project[] || vars['projects'] as Project[] || [];
  const carouselSettings = vars[`${nodeId}.carousel-settings`] as CarouselSettings || vars['carousel-settings'] as CarouselSettings || {
    autoplay: true,
    autoplayDelay: 5000,
    showDots: true,
    showArrows: true,
    slidesToShow: 3,
    slidesToScroll: 1
  };
  const sectionStyles = vars[`${nodeId}.section-styles`] as SectionStyles || vars['section-styles'] as SectionStyles || {
    backgroundColor: '#f8fafc',
    textColor: '#1f2937',
    titleColor: '#111827',
    padding: '4rem 1rem'
  };
  const cardStyles = vars[`${nodeId}.card-styles`] as CardStyles || vars['card-styles'] as CardStyles || {
    cardBackground: '#ffffff',
    cardBorder: '#e5e7eb',
    cardShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    borderRadius: '0.75rem',
    hoverScale: 1.05
  };
  const buttonStyles = vars[`${nodeId}.button-styles`] as ButtonStyles || vars['button-styles'] as ButtonStyles || {
    buttonColor: '#3b82f6',
    buttonTextColor: '#ffffff',
    buttonHoverColor: '#2563eb',
    buttonText: 'View Project'
  };

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Calculate responsive slides to show
  const [slidesToShow, setSlidesToShow] = useState(carouselSettings.slidesToShow);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setSlidesToShow(1);
      } else if (width < 1024) {
        setSlidesToShow(Math.min(2, carouselSettings.slidesToShow));
      } else {
        setSlidesToShow(carouselSettings.slidesToShow);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [carouselSettings.slidesToShow]);

  // Auto-scroll functionality
  useEffect(() => {
    if (!carouselSettings.autoplay || isHovered || projects.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSlide(prev => {
        const maxSlide = Math.max(0, projects.length - slidesToShow);
        return prev >= maxSlide ? 0 : prev + carouselSettings.slidesToScroll;
      });
    }, carouselSettings.autoplayDelay);

    return () => clearInterval(interval);
  }, [carouselSettings.autoplay, carouselSettings.autoplayDelay, carouselSettings.slidesToScroll, isHovered, projects.length, slidesToShow]);

  const nextSlide = () => {
    const maxSlide = Math.max(0, projects.length - slidesToShow);
    setCurrentSlide(prev => prev >= maxSlide ? 0 : prev + carouselSettings.slidesToScroll);
  };

  const prevSlide = () => {
    const maxSlide = Math.max(0, projects.length - slidesToShow);
    setCurrentSlide(prev => prev <= 0 ? maxSlide : prev - carouselSettings.slidesToScroll);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  if (projects.length === 0) {
    return null;
  }

  return (
    <section
      className="relative py-20 bg-gradient-to-br from-gray-50 via-white to-blue-50/30"
      style={{
        color: sectionStyles.textColor,
      }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 right-10 w-40 h-40 bg-blue-100/50 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-32 h-32 bg-purple-100/50 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10 px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-4 py-2 mb-6 bg-blue-50 rounded-full border border-blue-100">
            <span className="text-blue-600 font-medium text-sm">Portfolio</span>
          </div>
          <h2
            className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent leading-tight"
            style={{ color: sectionStyles.titleColor }}
          >
            {sectionTitle}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            {sectionDescription}
          </p>
        </div>

        {/* Carousel Container */}
        <div
          className="relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Navigation Arrows */}
          {carouselSettings.showArrows && projects.length > slidesToShow && (
            <>
              <button
                onClick={prevSlide}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-white bg-opacity-90 hover:bg-opacity-100 rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-110"
                style={{ color: sectionStyles.titleColor }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={nextSlide}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-white bg-opacity-90 hover:bg-opacity-100 rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-110"
                style={{ color: sectionStyles.titleColor }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* Projects Grid */}
          <div className="overflow-hidden px-4">
            <div
              className="flex transition-transform duration-500 ease-in-out gap-6"
              style={{
                transform: `translateX(-${currentSlide * (100 / slidesToShow)}%)`
              }}
            >
              {projects.map((project, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 group"
                  style={{
                    width: `calc(${100 / slidesToShow}% - ${(slidesToShow - 1) * 1.5}rem / ${slidesToShow})`
                  }}
                >
                  <div className="modern-card group bg-white/80 backdrop-blur-sm border border-white/50 shadow-xl hover:shadow-2xl rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-2">
                    {/* Project Image */}
                    <div className="relative overflow-hidden">
                      <img
                        src={project.image}
                        alt={project.title}
                        className="w-full h-56 object-cover transition-all duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300" />

                      {/* Floating action button */}
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                        <div className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg">
                          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Project Content */}
                    <div className="p-8">
                      <h3 className="text-2xl font-bold mb-3 text-gray-900 group-hover:text-blue-600 transition-colors duration-300">
                        {project.title}
                      </h3>
                      <p className="text-gray-600 mb-6 leading-relaxed line-clamp-3">
                        {project.description}
                      </p>

                      {/* Technologies */}
                      {project.technologies && project.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                          {project.technologies.map((tech, techIndex) => (
                            <span
                              key={techIndex}
                              className="px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 rounded-full border border-blue-100 hover:scale-105 transition-transform duration-200"
                            >
                              {typeof tech === 'string' ? tech : tech.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Project Link */}
                      <a
                        href={project.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modern-button group/btn inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        <span>{buttonStyles.buttonText}</span>
                        <svg className="w-4 h-4 ml-2 transition-transform duration-300 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </a>
                    </div>

                    {/* Bottom gradient accent */}
                    <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Dots */}
          {carouselSettings.showDots && projects.length > slidesToShow && (
            <div className="flex justify-center mt-8 space-x-2">
              {Array.from({ length: Math.ceil(projects.length / slidesToShow) }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index * carouselSettings.slidesToScroll)}
                  className={`w-3 h-3 rounded-full transition-all duration-200 ${
                    Math.floor(currentSlide / carouselSettings.slidesToScroll) === index
                      ? 'scale-125'
                      : 'opacity-50 hover:opacity-75'
                  }`}
                  style={{
                    backgroundColor: Math.floor(currentSlide / carouselSettings.slidesToScroll) === index
                      ? buttonStyles.buttonColor
                      : sectionStyles.textColor
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}