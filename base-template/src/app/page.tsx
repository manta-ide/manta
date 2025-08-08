'use client';

import React from 'react';
import Header from './header';
import Introduction from './introduction';
import Skills from './skills';
import Projects from './projects';
import Contact from './contact';

export default function Home() {
  return (
    <main>
      <Header />
      <Introduction />
      <Skills />
      <Projects />
      <Contact />
    </main>
  );
}
