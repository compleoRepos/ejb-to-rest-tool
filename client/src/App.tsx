import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ProjectsPage from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ArchitecturePage from "./pages/Architecture";
import MigrationPage from "./pages/Migration";
import CollaborationPage from "./pages/Collaboration";
import ApiDocsPage from "./pages/ApiDocs";
import CompleoPage from "./pages/Compleo";
import AppLayout from "./components/AppLayout";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/projects"} component={ProjectsPage} />
      <Route path={"/projects/:id"}>
        {(params) => <ProjectDetail id={Number(params.id)} />}
      </Route>
      <Route path={"/architecture/:projectId"}>
        {(params) => <ArchitecturePage projectId={Number(params.projectId)} />}
      </Route>
      <Route path={"/migration/:projectId"}>
        {(params) => <MigrationPage projectId={Number(params.projectId)} />}
      </Route>
      <Route path={"/collaboration/:projectId"}>
        {(params) => <CollaborationPage projectId={Number(params.projectId)} />}
      </Route>
      <Route path={"/compleo"} component={CompleoPage} />
      <Route path={"/api-docs"} component={ApiDocsPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.16 0.01 250)",
                border: "1px solid oklch(0.25 0.01 250)",
                color: "oklch(0.92 0.01 250)",
              },
            }}
          />
          <AppLayout>
            <Router />
          </AppLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
