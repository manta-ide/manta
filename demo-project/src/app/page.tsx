import { Edit3, File, Code, MessageCircle } from 'lucide-react';

export default function LandingPage() {
  return (
      <div className="min-h-full bg-background">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center h-[75vh] px-8 bg-white">
        <div className="text-center max-w-4xl">
          <Edit3 className="w-20 h-20 text-black mx-auto mb-8" />
          <h1 className="text-6xl font-bold mb-6 text-black">
            Manta Editor
          </h1>
          <p className="text-2xl text-black mb-8 max-w-2xl mx-auto">
            The future of Next.js development. Edit components visually with AI assistance.
          </p>
          <div className="flex justify-center gap-4 mb-16">
            <button className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
              Get Started
            </button>
            <button className="px-8 py-4 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-lg font-semibold hover:from-red-600 hover:to-red-800 transition-colors">
              View Demo
            </button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-green-500">Powerful Features</h2>
            <p className="text-xl text-muted-foreground">Everything you need to build modern Next.js applications</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="p-8 bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <File className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Multi-File Editing</h3>
              <p className="text-muted-foreground">Edit multiple files simultaneously with our intuitive file tree and editor interface.</p>
            </div>
            
            <div className="p-8 bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <Code className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Live Preview</h3>
              <p className="text-muted-foreground">See your changes instantly with our real-time preview that updates as you code.</p>
            </div>
            
            <div className="p-8 bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <MessageCircle className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">AI Assistant</h3>
              <p className="text-muted-foreground">Get intelligent code suggestions and automated component generation with our AI helper.</p>
            </div>
            
            <div className="p-8 bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <Edit3 className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Visual Selection</h3>
              <p className="text-muted-foreground">Click and drag to select UI elements directly in the preview for precise editing.</p>
            </div>
            
            <div className="p-8 bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-primary font-bold">TS</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">TypeScript Support</h3>
              <p className="text-muted-foreground">Full TypeScript support with intelligent autocomplete and type checking.</p>
            </div>
            
            <div className="p-8 bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-primary font-bold">⚡</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Fast Development</h3>
              <p className="text-muted-foreground">Accelerate your development workflow with our optimized editing environment.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="py-24 px-8 bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Choose Your Plan</h2>
            <p className="text-xl text-muted-foreground">Start for free, upgrade when you need more</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-card rounded-xl border shadow-sm">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">Starter</h3>
                <div className="text-4xl font-bold mb-2">$0</div>
                <p className="text-muted-foreground">Perfect for getting started</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                  <span className="text-sm">Basic file editing</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                  <span className="text-sm">Live preview</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                  <span className="text-sm">Community support</span>
                </li>
              </ul>
              <button className="w-full py-3 border border-border rounded-lg font-semibold hover:bg-accent transition-colors">
                Get Started
              </button>
            </div>
            <div className="p-8 bg-card rounded-xl border-2 border-primary shadow-lg relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              </div>
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">Pro</h3>
                <div className="text-4xl font-bold mb-2">$29</div>
                <p className="text-muted-foreground">For serious developers</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                  <span className="text-sm">Everything in Starter</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                  <span className="text-sm">AI assistant</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary.rounded-full"></div>
                  </div>
                  <span className="text-sm">Advanced features</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary.rounded-full"></div>
                  </div>
                  <span className="text-sm">Priority support</span>
                </li>
              </ul>
              <button className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
                Start Free Trial
              </button>
            </div>
            <div className="p-8 bg-card rounded-xl border shadow-sm">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
                <div className="text-4xl font-bold mb-2">$99</div>
                <p className="text-muted-foreground">For teams and organizations</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary.rounded-full"></div>
                  </div>
                  <span className="text-sm">Everything in Pro</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary.rounded-full"></div>
                  </div>
                  <span className="text-sm">Team collaboration</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary.rounded-full"></div>
                  </div>
                  <span className="text-sm">Custom integrations</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary.rounded-full"></div>
                  </div>
                  <span className="text-sm">Dedicated support</span>
                </li>
              </ul>
              <button className="w-full py-3 border border-border rounded-lg font-semibold hover:bg-accent transition-colors">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Team Section */}
      <div className="py-24 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Meet the Team</h2>
            <p className="text-xl text-muted-foreground">Our dedicated team of professionals.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8">
            <div className="p-8 bg-card rounded-xl border shadow-sm text-center">
              <div className="w-24 h-24 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center text-3xl text-primary">A</div>
              <h3 className="text-xl font-semibold mb-1">Alice Doe</h3>
              <p className="text-muted-foreground">CEO</p>
            </div>
            <div className="p-8 bg-card rounded-xl border shadow-sm text-center">
              <div className="w-24 h-24 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center text-3xl text-primary">B</div>
              <h3 className="text-xl font-semibold mb-1">Bob Smith</h3>
              <p className="text-muted-foreground">CTO</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-24 px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Start Building?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join thousands of developers who are already using Manta Editor to build amazing Next.js applications.
          </p>
          <div className="flex justify-center gap-4">
            <button className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
              Start Free Trial
            </button>
            <button className="px-8 py-4 border border-border rounded-lg font-semibold hover:bg-accent transition-colors">
              Schedule Demo
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-12 px-8 border-t bg-muted/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <Edit3 className="w-6 h-6 text-primary" />
              <span className="font-semibold">Manta Editor</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <span>© 2024 Manta Editor. All rights reserved.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}