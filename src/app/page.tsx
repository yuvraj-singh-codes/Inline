'use client'
import { useState } from 'react';
import { Menu, X, ArrowRight, Code, Zap, Shield, ChevronDown } from 'lucide-react';

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    {
      icon: <Code className="w-6 h-6" />,
      title: "Developer Experience",
      description: "Built with the latest web technologies for the best developer experience"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Very Very Fast",
      description: "Optimized performance with automatic code splitting and lazy loading"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Production Ready",
      description: "Battle-tested and ready for enterprise-scale applications"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="fixed w-full bg-slate-900/80 backdrop-blur-md z-50 border-b border-purple-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                  YourBrand
                </h1>
              </div>
            </div>
            
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-8">
                <a href="#features" className="text-gray-300 hover:text-white transition-colors px-3 py-2">Features</a>
                <a href="#about" className="text-gray-300 hover:text-white transition-colors px-3 py-2">About</a>
                <a href="#contact" className="text-gray-300 hover:text-white transition-colors px-3 py-2">Contact</a>
                <button className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-6 py-2 rounded-full hover:shadow-lg hover:shadow-purple-500/50 transition-all">
                  Get Started
                </button>
              </div>
            </div>
            
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-gray-300 hover:text-white"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-800/95 backdrop-blur-md">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              <a href="#features" className="text-gray-300 hover:text-white block px-3 py-2">Features</a>
              <a href="#about" className="text-gray-300 hover:text-white block px-3 py-2">About</a>
              <a href="#contact" className="text-gray-300 hover:text-white block px-3 py-2">Contact</a>
              <button className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white px-6 py-2 rounded-full mt-2">
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="animate-fade-in">
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              Build the Future
              <span className="block bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
                With Next.js
              </span>
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Create lightning-fast web applications with the power of React and the simplicity of Next.js
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button className="group bg-gradient-to-r from-purple-500 to-pink-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:shadow-2xl hover:shadow-purple-500/50 transition-all flex items-center gap-2">
                Start Building
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="border-2 border-purple-500 text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-purple-500/10 transition-all">
                Learn More
              </button>
            </div>
          </div>
          
          <div className="mt-16 flex justify-center">
            <ChevronDown className="w-8 h-8 text-purple-400 animate-bounce" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-4xl font-bold text-center text-white mb-16">
  Why Choose This
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-slate-800/50 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-8 hover:border-purple-500/50 transition-all hover:transform hover:-translate-y-2 hover:shadow-xl hover:shadow-purple-500/20"
              >
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 w-14 h-14 rounded-xl flex items-center justify-center mb-4 text-white">
                  {feature.icon}
                </div>
                <h4 className="text-2xl font-semibold text-white mb-3">
                  {feature.title}
                </h4>
                <p className="text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-purple-500/20 to-pink-600/20 backdrop-blur-sm border border-purple-500/30 rounded-3xl p-12">
          <h3 className="text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h3>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of developers building amazing applications
          </p>
          <button className="bg-white text-purple-900 px-8 py-4 rounded-full text-lg font-semibold hover:shadow-2xl hover:shadow-white/50 transition-all">
            Start Your Journey
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900/50 border-t border-purple-500/20 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center text-gray-400">
          <p>&copy; 2025 YourBrand. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}