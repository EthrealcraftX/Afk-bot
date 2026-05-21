/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sparkles, Terminal, Cpu, Layers, Flame, ArrowRight } from 'lucide-react';

export default function App() {
  return (
    <div id="welcome-container" className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between selection:bg-indigo-500 selection:text-white font-sans antialiased">
      {/* Header */}
      <header id="welcome-header" className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-sm shadow-indigo-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-slate-900 text-lg">AI Studio</span>
              <span className="ml-1.5 px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">Workspace Live</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            v1.0.0
          </div>
        </div>
      </header>

      {/* Main Hero Card Section */}
      <main id="welcome-main" className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-2 bg-indigo-50 px-3 py-1.5 rounded-full text-xs font-semibold text-indigo-700 border border-indigo-100 mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
            <span>Project Workspace Loaded Successfully</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-none mb-4">
            What shall we build <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">together</span>?
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed font-normal max-w-2xl mx-auto">
            Your high-performance full-stack environment has been initialized with the latest frameworks. Simply describe your idea in the chat, and I'll code it instantly!
          </p>
        </div>

        {/* Dynamic Bento Modules */}
        <div id="features-grid" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm transition hover:shadow-md">
            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 w-fit mb-4">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1.5">React 19 & Tailwind v4</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Optimized compiler runtime paired with next-generation high-speed styling for beautiful, fluid layouts.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm transition hover:shadow-md">
            <div className="p-3 bg-violet-50 rounded-xl text-violet-600 w-fit mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1.5">Gemini GenAI SDK</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Pre-installed server configurations ready to build intelligent agents, summarizers, assistants, or chatbots.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm transition hover:shadow-md">
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 w-fit mb-4">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1.5">Full-Stack Capability</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Express.js server configured with dotenv environment parsing for robust backend processes and secure proxy requests.
            </p>
          </div>

        </div>

        {/* Suggestion Prompt list */}
        <div className="bg-slate-900 text-slate-100 p-8 rounded-3xl relative overflow-hidden shadow-xl shadow-slate-950/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center space-x-2 mb-2 text-indigo-400">
                <Flame className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Inspiration</span>
              </div>
              <h4 className="text-xl font-bold mb-2">Ready for customization</h4>
              <p className="text-xs md:text-sm text-slate-400 max-w-xl">
                Try asking me to build a personalized dashboard, a dynamic data visualization canvas, a real-time calendar organizer, or an interactive markdown editor.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-sm text-indigo-400 bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl font-semibold">
              <span>Awaiting prompt...</span>
              <ArrowRight className="w-4.5 h-4.5" />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer id="welcome-footer" className="border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-400">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} AI Studio Applet. Crafted with pride.</p>
          <div className="flex space-x-4">
            <span>Powered by Gemini</span>
            <span className="text-slate-300">|</span>
            <span>TypeScript + Vite</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
