import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 bg-gradient-to-br from-green-300 via-blue-400 to-purple-500 text-white">
      <Button className="mt-6 px-6 py-3 bg-white bg-opacity-80 text-black font-semibold rounded-lg shadow-lg hover:bg-opacity-100 transition-colors">
        Get Started
      </Button>
      <h1 className="text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500">
        Welcome to Your Colorful Next.js App!
      </h1>
      <p className="mt-4 text-lg max-w-prose text-center opacity-90">
        Dive into a vibrant experience powered by Next.js, Tailwind CSS, and ShadCN UI. Let your creativity shine!
      </p>
    </div>
  );
}
