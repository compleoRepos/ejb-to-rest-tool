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
import CompleoAgentPage from "./pages/CompleoAgent";
import LearningRulesPage from "./pages/LearningRules";
import WorkspacePage from "./pages/Workspace";
import SagasPage from "./pages/Sagas";
import AppLayout from "./components/AppLayout";
import { StatusBar } from "./components/StatusBar";
import { useGlobalErrorToast } from "./components/Toast";
import UploadPage from "./pages/UploadPage";
import AnalyzePage from "./pages/AnalyzePage";
import ConfigurePage from "./pages/ConfigurePage";
import GeneratePage from "./pages/GeneratePage";
import ResultPage from "./pages/ResultPage";
import SchemaDecoderPage from "./pages/SchemaDecoderPage";

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
      <Route path={"/compleo/upload"} component={UploadPage} />
      <Route path={"/compleo/agent/:sessionId/analyze"} component={AnalyzePage} />
      <Route path={"/compleo/agent/:sessionId/schema-decoder"} component={SchemaDecoderPage} />
      <Route path={"/compleo/agent/:sessionId/configure"} component={ConfigurePage} />
      <Route path={"/compleo/agent/:sessionId/generate"} component={GeneratePage} />
      <Route path={"/compleo/agent/:sessionId/result"} component={ResultPage} />
      <Route path={"/compleo/agent"} component={CompleoAgentPage} />
      <Route path={"/compleo/sagas"} component={SagasPage} />
      <Route path={"/compleo/rules"} component={LearningRulesPage} />
      <Route path={"/compleo/workspace"} component={WorkspacePage} />
      <Route path={"/compleo/architecture"}>
        {() => <ArchitecturePage />}
      </Route>
      <Route path={"/api-docs"} component={ApiDocsPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useGlobalErrorToast();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.20 0.01 250)",
                border: "1px solid oklch(0.30 0.01 250)",
                color: "oklch(0.93 0.01 250)",
              },
            }}
          />
          <StatusBar />
          <AppLayout>
            <Router />
          </AppLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
