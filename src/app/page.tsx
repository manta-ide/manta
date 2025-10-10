"use client";
import React from "react";
import Link from "next/link";
import { BackgroundBeams } from "@/components/ui/background-beams";
import StarOnGithub from "@/components/ui/button-github";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-zinc-950 relative flex flex-col items-center justify-center antialiased px-4">
      <div className="w-full max-w-4xl mx-auto text-center">
        <h1 className="relative z-10 text-lg md:text-7xl bg-clip-text text-transparent bg-gradient-to-b from-zinc-100 to-zinc-400 font-sans font-bold mb-4">
          Manta IDE
        </h1>
        <p className="text-zinc-300 max-w-2xl mx-auto mb-4 text-sm relative z-10 whitespace-nowrap">
          See a chart of any repository, and modify it to change the code.
        </p>
        <p className="text-zinc-300 max-w-2xl mx-auto mb-6 text-sm relative z-10">
          Check out the charts for{" "}
          <Link href="/assistant-ui" className="text-blue-400 hover:text-blue-300 underline">
            assistant-ui
          </Link>
          ,{" "}
          <Link href="/browser-use" className="text-blue-400 hover:text-blue-300 underline">
            browser-use
          </Link>
          ,{" "}
          <Link href="/bun" className="text-blue-400 hover:text-blue-300 underline">
            bun
          </Link>
          {/* ,{" "}
          <Link href="/linux" className="text-blue-400 hover:text-blue-300 underline">
            linux
          </Link> */}
        </p>
        <div className="relative z-10">
          <StarOnGithub />
        </div>
      </div>
      <BackgroundBeams />
    </div>
  );
}
