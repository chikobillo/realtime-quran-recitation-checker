import { RecitationChecker } from "@/components/recitation-checker";
import { Toaster } from "@/components/ui/sonner";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto py-8 px-4">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            Quran Recitation Checker
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Practice your Quranic recitation with real-time feedback
          </p>
        </header>
        
        <main className="max-w-4xl mx-auto">
          <RecitationChecker />
        </main>
        
        <footer className="mt-16 text-center text-sm text-slate-500 dark:text-slate-600">
          <p>Powered by Web Speech API for Arabic recognition</p>
          <p className="mt-1">
            <a 
              href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-slate-700 dark:hover:text-slate-400"
            >
              Learn more about Web Speech API
            </a>
          </p>
        </footer>
      </div>
      <Toaster />
    </div>
  );
}
