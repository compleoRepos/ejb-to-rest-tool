import Header from "@/components/Header";
import { CheckCircle, FileCode, GitBranch, Package, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const WRAPPERS = [
  {
    name: "card-administration-bmcedirect",
    domain: "Card Administration",
    domainId: "SD0170",
    projects: ["activation-carte", "opposition-carte", "coordonnees-3dsecure", "tokenisation-carte", "releve-carte", "vente-distance-carte"],
    endpoints: 13,
    files: 66,
  },
  {
    name: "payment-order-bmcedirect",
    domain: "Payment Order",
    domainId: "SD0200",
    projects: ["commande-chequier", "demande-dotation", "mise-disposition", "virement-permanent"],
    endpoints: 12,
    files: 58,
  },
  {
    name: "customer-offer-bmcedirect",
    domain: "Customer Offer",
    domainId: "SD0160",
    projects: ["produits-epargne", "souscription-assistance", "souscription-opv"],
    endpoints: 6,
    files: 42,
  },
  {
    name: "foreign-exchange-bmcedirect",
    domain: "Foreign Exchange",
    domainId: "SD0180",
    projects: ["transfert-euro"],
    endpoints: 6,
    files: 44,
  },
  {
    name: "consumer-loan-bmcedirect",
    domain: "Consumer Loan",
    domainId: "SD0190",
    projects: ["interface-credit-jocker"],
    endpoints: 4,
    files: 38,
  },
  {
    name: "current-account-bmcedirect",
    domain: "Current Account",
    domainId: "SD0150",
    projects: ["operation-avenir", "avis-opere"],
    endpoints: 4,
    files: 38,
  },
  {
    name: "party-notification-bmcedirect",
    domain: "Party Notification",
    domainId: "SD0250",
    projects: ["push-notification", "interface-send-sms"],
    endpoints: 4,
    files: 38,
  },
];

export default function Results() {
  const totalEndpoints = WRAPPERS.reduce((s, w) => s + w.endpoints, 0);
  const totalFiles = WRAPPERS.reduce((s, w) => s + w.files, 0);
  const totalProjects = WRAPPERS.reduce((s, w) => s + w.projects.length, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="container">
          <div className="mb-8">
            <h1 className="font-display font-bold text-3xl mb-2">Résultats de génération</h1>
            <p className="text-muted-foreground">
              7 wrappers BIAN générés à partir de 18 projets EJB legacy
            </p>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <StatCard label="Wrappers" value="7" icon={<Package className="w-5 h-5" />} />
            <StatCard label="Projets EJB" value={totalProjects.toString()} icon={<FileCode className="w-5 h-5" />} />
            <StatCard label="Endpoints" value={totalEndpoints.toString()} icon={<GitBranch className="w-5 h-5" />} />
            <StatCard label="Fichiers" value={totalFiles.toString()} icon={<CheckCircle className="w-5 h-5" />} />
          </div>

          {/* Wrappers List */}
          <div className="space-y-4">
            {WRAPPERS.map((wrapper) => (
              <div
                key={wrapper.name}
                className="p-6 rounded-lg border border-border bg-card hover:border-[oklch(0.78_0.15_200/0.3)] transition-colors duration-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-mono text-base font-medium">{wrapper.name}</h3>
                      <span className="text-xs font-mono text-cyan bg-[oklch(0.78_0.15_200/0.1)] px-2 py-0.5 rounded">
                        {wrapper.domainId}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Service Domain: <span className="text-foreground">{wrapper.domain}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs gap-1 border-border hover:border-[oklch(0.78_0.15_200/0.5)] hover:text-cyan">
                      <ExternalLink className="w-3 h-3" />
                      Swagger
                    </Button>
                    <Button size="sm" className="text-xs gap-1 bg-[oklch(0.78_0.15_200)] text-[oklch(0.13_0.02_230)] hover:bg-[oklch(0.82_0.15_200)]">
                      ZIP
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs text-muted-foreground mb-3">
                  <span>{wrapper.endpoints} endpoints</span>
                  <span>{wrapper.files} fichiers</span>
                  <span>{wrapper.projects.length} projet{wrapper.projects.length > 1 ? "s" : ""} fusionnés</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {wrapper.projects.map((project) => (
                    <span
                      key={project}
                      className="text-xs font-mono px-2.5 py-1 rounded bg-secondary/50 border border-border text-muted-foreground"
                    >
                      {project}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Test Results */}
          <div className="mt-12 p-6 rounded-lg border border-[oklch(0.82_0.25_140/0.3)] bg-[oklch(0.82_0.25_140/0.05)]">
            <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[oklch(0.82_0.25_140)]" />
              Tests de validation
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <TestResult label="Compilation Maven" result="7/7 BUILD SUCCESS" />
              <TestResult label="Tests Controller" result="147 tests, 0 échecs" />
              <TestResult label="Swagger UI" result="7/7 HTTP 200" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card text-center">
      <div className="text-cyan mb-2 flex justify-center">{icon}</div>
      <div className="font-display font-bold text-2xl text-foreground mb-0.5">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function TestResult({ label, result }: { label: string; result: string }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle className="w-4 h-4 text-[oklch(0.82_0.25_140)] shrink-0" />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground font-mono">{result}</div>
      </div>
    </div>
  );
}
