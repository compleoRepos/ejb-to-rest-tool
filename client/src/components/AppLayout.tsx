/**
 * AppLayout — Navigation globale v4.0
 * Top bar avec navigation contextuelle + sidebar pour les projets.
 * Design: "Terminal Craft" — Dark IDE aesthetic.
 */
import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Terminal, FolderGit2, LayoutDashboard, Code2, Network,
  GitBranch, MessageSquare, BookOpen, ChevronRight, Menu, X, Package,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Accueil", icon: LayoutDashboard },
  { path: "/projects", label: "Projets", icon: FolderGit2 },
  { path: "/compleo", label: "Compleo", icon: Package },
  { path: "/api-docs", label: "API", icon: BookOpen },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Extract project context from URL
  const projectMatch = location.match(/\/(projects|architecture|migration|collaboration)\/(\d+)/);
  const isProjectContext = !!projectMatch;
  const projectId = projectMatch ? projectMatch[2] : null;

  const PROJECT_TABS = projectId ? [
    { path: `/projects/${projectId}`, label: "Analyse", icon: Code2 },
    { path: `/architecture/${projectId}`, label: "Architecture", icon: Network },
    { path: `/migration/${projectId}`, label: "Migration", icon: GitBranch },
    { path: `/collaboration/${projectId}`, label: "Collaboration", icon: MessageSquare },
  ] : [];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Terminal className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm tracking-wide hidden sm:inline">Java Legacy Modernizer</span>
            <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary hidden sm:inline-flex">v4.0</Badge>
          </Link>

          <div className="w-px h-6 bg-border hidden sm:block" />

          {/* Main Navigation */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.path || (item.path === "/projects" && location.startsWith("/projects"));
              return (
                <Link key={item.path} href={item.path}>
                  <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}>
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/60 font-mono hidden md:inline">par Hamza NORDINE</span>
          {/* Mobile menu toggle */}
          <button
            className="sm:hidden p-1.5 rounded-md hover:bg-secondary/50 text-muted-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-border bg-card p-2 space-y-1 z-40">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                    isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              </Link>
            );
          })}
        </div>
      )}

      {/* Project Context Tabs */}
      {isProjectContext && (
        <div className="h-9 border-b border-border flex items-center px-4 gap-1 bg-secondary/20 shrink-0 overflow-x-auto">
          <Link href="/projects">
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mr-2">
              <FolderGit2 className="w-3 h-3" />
              <span>Projets</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </Link>
          {PROJECT_TABS.map((tab) => {
            const isActive = location === tab.path;
            return (
              <Link key={tab.path} href={tab.path}>
                <button className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}>
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              </Link>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
