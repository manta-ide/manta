import React from 'react';

const SimpleLandingPage = () => {
  return (
    <div id="node-element-simple-landing-page" className="min-h-screen flex flex-col">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <Footer />
    </div>
  );
};

const Header = () => (
  <header id="node-element-header" className="bg-gray-800 text-white p-4">
    <h1 className="text-2xl">My Product</h1>
  </header>
);

const HeroSection = () => (
  <section id="node-element-hero-section" className="flex flex-col items-center justify-center bg-blue-500 text-white p-8">
    <h2 className="text-4xl mb-4">Welcome to My Product</h2>
    <p className="text-lg">Discover the features and benefits of using our product.</p>
  </section>
);

const FeaturesSection = () => (
  <section id="node-element-features-section" className="p-8">
    <h3 className="text-2xl mb-4">Features</h3>
    <ul className="list-disc pl-5">
      <li>Feature 1: Easy to use</li>
      <li>Feature 2: Highly customizable</li>
      <li>Feature 3: Reliable and secure</li>
    </ul>
  </section>
);

const Footer = () => (
  <footer id="node-element-footer" className="bg-gray-800 text-white p-4 text-center">
    <p>&copy; 2023 My Product. All rights reserved.</p>
  </footer>
);

export default SimpleLandingPage;