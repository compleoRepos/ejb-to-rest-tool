import { Link, useLocation } from "wouter";

export default function Header() {
  const [location] = useLocation();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3 group">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663029604003/F54khK8YGk6g8AFuH5EYCt/ejb-rest-logo-WEVdfvsGHj8uqQrVHnTwxn.png"
            alt="Logo"
            className="w-9 h-9 transition-transform duration-150 group-hover:scale-105"
          />
          <span className="font-display font-bold text-lg text-cyan tracking-tight">
            EJB→REST
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/" active={location === "/"}>
            Accueil
          </NavLink>
          <NavLink href="/generator" active={location === "/generator"}>
            Générateur
          </NavLink>
          <NavLink href="/results" active={location === "/results"}>
            Résultats
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 ${
        active
          ? "text-cyan bg-secondary glow-cyan"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
    >
      {children}
    </Link>
  );
}
