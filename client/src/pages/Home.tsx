import { Link } from "wouter";
import Header from "@/components/Header";
import { ArrowRight, FileJson, Layers, Zap, Download, GitBranch, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero Section */}
      <section
        className="relative pt-32 pb-24 overflow-hidden"
        style={{
          backgroundImage: `url(https://d2xsxph8kpxj0f.cloudfront.net/310419663029604003/F54khK8YGk6g8AFuH5EYCt/hero-blueprint-bg-NJCFY8FiJzw2AKNV9LjcYV.webp)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background" />
        <div className="container relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-secondary/50 text-sm text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-[oklch(0.82_0.25_140)] animate-pulse" />
                Outil de modernisation bancaire
              </div>
              <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl leading-tight">
                <span className="text-foreground">Transformez vos </span>
                <span className="text-cyan">EJB</span>
                <span className="text-foreground"> en wrappers </span>
                <span className="text-cyan">REST BIAN</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                18 JSON en entrée, 7 wrappers Spring Boot en sortie. Regroupement automatique par Service Domain BIAN. Zéro code manuel.
              </p>
              <div className="flex items-center gap-4">
                <Link href="/generator">
                  <Button size="lg" className="gap-2 font-display font-semibold bg-[oklch(0.78_0.15_200)] text-[oklch(0.13_0.02_230)] hover:bg-[oklch(0.82_0.15_200)] transition-all duration-150 active:scale-[0.97]">
                    Lancer la génération
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/results">
                  <Button variant="outline" size="lg" className="gap-2 font-display border-border hover:border-[oklch(0.78_0.15_200/0.5)] hover:text-cyan transition-all duration-150">
                    Voir les résultats
                  </Button>
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663029604003/F54khK8YGk6g8AFuH5EYCt/pipeline-illustration-7TsRUALmU9WtC3xund4ZQZ.webp"
                alt="Pipeline EJB to REST"
                className="w-full max-w-lg mx-auto object-contain rounded-lg border border-border/50 glow-cyan"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline Steps */}
      <section className="py-20 border-t border-border">
        <div className="container">
          <h2 className="font-display font-bold text-3xl text-center mb-4">
            Pipeline de transformation
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
            Du JSON descripteur au wrapper Spring Boot déployable en 3 étapes
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step={1}
              icon={<FileJson className="w-6 h-6" />}
              title="Upload JSON"
              description="Déposez vos fichiers JSON décrivant les endpoints EJB (un par projet legacy)"
            />
            <StepCard
              step={2}
              icon={<Layers className="w-6 h-6" />}
              title="Mapping BIAN"
              description="Le moteur regroupe automatiquement par Service Domain et attribue les actions BIAN"
            />
            <StepCard
              step={3}
              icon={<Download className="w-6 h-6" />}
              title="Download Wrapper"
              description="Téléchargez le projet Spring Boot complet avec Swagger, tests et Dockerfile"
            />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-surface border-t border-border">
        <div className="container">
          <h2 className="font-display font-bold text-3xl text-center mb-16">
            Ce que génère chaque wrapper
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Zap className="w-5 h-5 text-cyan" />}
              title="Controller BIAN"
              description="Endpoints REST conformes à la nomenclature BIAN avec Bean Validation"
            />
            <FeatureCard
              icon={<Shield className="w-5 h-5 text-cyan" />}
              title="Resilience4j"
              description="Circuit breaker, retry et timeout intégrés dans le RestAdapter"
            />
            <FeatureCard
              icon={<GitBranch className="w-5 h-5 text-cyan" />}
              title="Diagrammes Mermaid"
              description="Un diagramme de séquence .mmd par use case, généré automatiquement"
            />
            <FeatureCard
              icon={<FileJson className="w-5 h-5 text-cyan" />}
              title="Collection Postman"
              description="Fichier JSON Postman prêt à importer avec tous les endpoints"
            />
            <FeatureCard
              icon={<Layers className="w-5 h-5 text-cyan" />}
              title="MockAdapter"
              description="Profil Spring 'mock' pour tester sans backend WebSphere"
            />
            <FeatureCard
              icon={<Download className="w-5 h-5 text-cyan" />}
              title="Dockerfile"
              description="Image Docker multi-stage optimisée, prête pour le déploiement"
            />
          </div>
        </div>
      </section>

      {/* BIAN Domains Visual */}
      <section className="py-20 border-t border-border">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663029604003/F54khK8YGk6g8AFuH5EYCt/bian-domains-visual-Pt4nEzVh46Pb5dQKDsgzsY.webp"
                alt="BIAN Service Domains"
                className="w-full max-w-md mx-auto object-contain"
              />
            </div>
            <div className="space-y-6">
              <h2 className="font-display font-bold text-3xl">
                Regroupement intelligent par Service Domain
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Le moteur analyse chaque endpoint et le classe automatiquement dans le bon Service Domain BIAN. Les projets du même domaine sont fusionnés dans un seul wrapper.
              </p>
              <div className="space-y-3">
                <DomainBadge name="Card Administration" count={6} />
                <DomainBadge name="Payment Order" count={4} />
                <DomainBadge name="Customer Offer" count={3} />
                <DomainBadge name="Party Notification" count={2} />
                <DomainBadge name="Current Account" count={2} />
                <DomainBadge name="Consumer Loan" count={1} />
                <DomainBadge name="Foreign Exchange" count={1} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container flex items-center justify-between text-sm text-muted-foreground">
          <span>EJB to REST Wrapper Generator</span>
          <span className="font-mono text-xs">v2.0 — BIAN Compliant</span>
        </div>
      </footer>
    </div>
  );
}

function StepCard({ step, icon, title, description }: { step: number; icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="relative p-6 rounded-lg border border-border bg-card hover:border-[oklch(0.78_0.15_200/0.5)] transition-all duration-200 group">
      <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-[oklch(0.78_0.15_200)] text-[oklch(0.13_0.02_230)] font-display font-bold text-sm flex items-center justify-center">
        {step}
      </div>
      <div className="text-cyan mb-4">{icon}</div>
      <h3 className="font-display font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-5 rounded-lg border border-border bg-card/50 hover:bg-card hover:border-[oklch(0.78_0.15_200/0.3)] transition-all duration-200">
      <div className="mb-3">{icon}</div>
      <h3 className="font-display font-semibold text-base mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function DomainBadge({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 rounded-md border border-border bg-secondary/30">
      <span className="font-mono text-sm text-foreground">{name}</span>
      <span className="text-xs font-medium text-cyan bg-[oklch(0.78_0.15_200/0.1)] px-2 py-0.5 rounded">
        {count} projet{count > 1 ? "s" : ""}
      </span>
    </div>
  );
}
