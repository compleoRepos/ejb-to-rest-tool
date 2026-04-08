/**
 * GitConnector — Connecteur Git multi-providers.
 * Supporte GitHub, GitLab, Azure DevOps, Gitea, et Git bare.
 *
 * Méthodes :
 *   clone(url, token, targetDir)
 *   createBranch(dir, branchName)
 *   writeFiles(dir, files)
 *   commit(dir, message)
 *   push(dir)
 *   createPR(config)
 *
 * @author Hamza NORDINE
 */

import simpleGit, { type SimpleGit } from "simple-git";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GitProvider = "github" | "gitlab" | "azure" | "gitea" | "bare";

export interface GitConfig {
  provider: GitProvider;
  token?: string;
  apiUrl?: string;
  username?: string;
}

export interface WorkingDir {
  path: string;
  git: SimpleGit;
  repoUrl: string;
  defaultBranch: string;
}

export interface GeneratedFileForGit {
  path: string;
  content: string;
}

export interface PRConfig {
  workingDir: WorkingDir;
  title: string;
  body: string;
  sourceBranch: string;
  targetBranch: string;
  labels?: string[];
  reviewers?: string[];
}

export interface PRResult {
  url: string;
  number: number;
  provider: GitProvider;
  state: "open" | "created";
}

export interface CloneResult extends WorkingDir {
  fileCount: number;
  javaFileCount: number;
}

// ─── GitConnector ─────────────────────────────────────────────────────────────

export class GitConnector {
  private config: GitConfig;

  constructor(config: GitConfig) {
    this.config = config;
  }

  // ─── clone ──────────────────────────────────────────────────────────────

  async clone(
    url: string,
    token?: string,
    targetDir?: string
  ): Promise<CloneResult> {
    const dir = targetDir || path.join(os.tmpdir(), `compleo-git-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });

    // Inject token into URL if provided
    const cloneUrl = this.injectToken(url, token || this.config.token);

    const git = simpleGit();
    await git.clone(cloneUrl, dir, ["--depth", "1"]);

    const repoGit = simpleGit(dir);

    // Detect default branch
    const branchInfo = await repoGit.branch();
    const defaultBranch = branchInfo.current || "main";

    // Count files
    let fileCount = 0;
    let javaFileCount = 0;
    const countFiles = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.name === ".git") continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          countFiles(full);
        } else {
          fileCount++;
          if (entry.name.endsWith(".java") || entry.name.endsWith(".jsp") || entry.name.endsWith(".xml")) {
            javaFileCount++;
          }
        }
      }
    };
    countFiles(dir);

    return {
      path: dir,
      git: repoGit,
      repoUrl: url,
      defaultBranch,
      fileCount,
      javaFileCount,
    };
  }

  // ─── createBranch ───────────────────────────────────────────────────────

  async createBranch(workingDir: WorkingDir, branchName: string): Promise<void> {
    await workingDir.git.checkoutLocalBranch(branchName);
  }

  // ─── writeFiles ─────────────────────────────────────────────────────────

  async writeFiles(
    workingDir: WorkingDir,
    files: GeneratedFileForGit[]
  ): Promise<number> {
    let written = 0;
    for (const file of files) {
      const fullPath = path.join(workingDir.path, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, "utf-8");
      written++;
    }
    // Stage all changes
    await workingDir.git.add(".");
    return written;
  }

  // ─── commit ─────────────────────────────────────────────────────────────

  async commit(workingDir: WorkingDir, message: string): Promise<string> {
    // Configure git user if not set
    try {
      await workingDir.git.addConfig("user.email", "compleo@migration.tool");
      await workingDir.git.addConfig("user.name", "Compleo Agent");
    } catch {
      // Ignore if already set
    }

    const result = await workingDir.git.commit(message);
    return result.commit || "unknown";
  }

  // ─── push ───────────────────────────────────────────────────────────────

  async push(workingDir: WorkingDir, branchName?: string): Promise<void> {
    const branch = branchName || (await workingDir.git.branch()).current;
    await workingDir.git.push("origin", branch, ["--set-upstream"]);
  }

  // ─── createPR ───────────────────────────────────────────────────────────

  async createPR(config: PRConfig): Promise<PRResult> {
    switch (this.config.provider) {
      case "github":
        return this.createGitHubPR(config);
      case "gitlab":
        return this.createGitLabMR(config);
      case "azure":
        return this.createAzurePR(config);
      case "gitea":
        return this.createGiteaPR(config);
      case "bare":
        throw new Error("Git bare ne supporte pas la création de PR. Utilisez push seulement.");
      default:
        throw new Error(`Provider non supporté: ${this.config.provider}`);
    }
  }

  // ─── GitHub PR ──────────────────────────────────────────────────────────

  private async createGitHubPR(config: PRConfig): Promise<PRResult> {
    const apiUrl = this.config.apiUrl || "https://api.github.com";
    const { owner, repo } = this.extractOwnerRepo(config.workingDir.repoUrl, "github");

    const response = await fetch(`${apiUrl}/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: config.title,
        body: config.body,
        head: config.sourceBranch,
        base: config.targetBranch,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub PR creation failed (${response.status}): ${error}`);
    }

    const data = await response.json() as any;
    return {
      url: data.html_url,
      number: data.number,
      provider: "github",
      state: "open",
    };
  }

  // ─── GitLab MR ──────────────────────────────────────────────────────────

  private async createGitLabMR(config: PRConfig): Promise<PRResult> {
    const apiUrl = this.config.apiUrl || "https://gitlab.com/api/v4";
    const projectPath = this.extractProjectPath(config.workingDir.repoUrl, "gitlab");
    const encodedPath = encodeURIComponent(projectPath);

    const response = await fetch(`${apiUrl}/projects/${encodedPath}/merge_requests`, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": this.config.token || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: config.title,
        description: config.body,
        source_branch: config.sourceBranch,
        target_branch: config.targetBranch,
        labels: config.labels?.join(","),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitLab MR creation failed (${response.status}): ${error}`);
    }

    const data = await response.json() as any;
    return {
      url: data.web_url,
      number: data.iid,
      provider: "gitlab",
      state: "open",
    };
  }

  // ─── Azure DevOps PR ────────────────────────────────────────────────────

  private async createAzurePR(config: PRConfig): Promise<PRResult> {
    const { org, project, repo } = this.extractAzureInfo(config.workingDir.repoUrl);
    const apiUrl = this.config.apiUrl || `https://dev.azure.com/${org}/${project}/_apis`;

    const response = await fetch(
      `${apiUrl}/git/repositories/${repo}/pullrequests?api-version=7.1`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`:${this.config.token}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: config.title,
          description: config.body,
          sourceRefName: `refs/heads/${config.sourceBranch}`,
          targetRefName: `refs/heads/${config.targetBranch}`,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure DevOps PR creation failed (${response.status}): ${error}`);
    }

    const data = await response.json() as any;
    return {
      url: `https://dev.azure.com/${org}/${project}/_git/${repo}/pullrequest/${data.pullRequestId}`,
      number: data.pullRequestId,
      provider: "azure",
      state: "created",
    };
  }

  // ─── Gitea PR ───────────────────────────────────────────────────────────

  private async createGiteaPR(config: PRConfig): Promise<PRResult> {
    const apiUrl = this.config.apiUrl || "https://gitea.example.com/api/v1";
    const { owner, repo } = this.extractOwnerRepo(config.workingDir.repoUrl, "gitea");

    const response = await fetch(`${apiUrl}/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `token ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: config.title,
        body: config.body,
        head: config.sourceBranch,
        base: config.targetBranch,
        labels: config.labels?.map(Number).filter(Boolean),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gitea PR creation failed (${response.status}): ${error}`);
    }

    const data = await response.json() as any;
    return {
      url: data.html_url,
      number: data.number,
      provider: "gitea",
      state: "open",
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private injectToken(url: string, token?: string): string {
    if (!token) return url;

    // HTTPS URL: https://github.com/owner/repo.git
    if (url.startsWith("https://")) {
      const urlObj = new URL(url);
      if (this.config.provider === "gitlab") {
        urlObj.username = "oauth2";
        urlObj.password = token;
      } else if (this.config.provider === "azure") {
        urlObj.username = "";
        urlObj.password = token;
      } else {
        // GitHub, Gitea
        urlObj.username = token;
        urlObj.password = "x-oauth-basic";
      }
      return urlObj.toString();
    }

    // SSH URL: git@github.com:owner/repo.git — can't inject token
    return url;
  }

  private extractOwnerRepo(
    url: string,
    _provider: string
  ): { owner: string; repo: string } {
    // Handle HTTPS: https://github.com/owner/repo.git
    // Handle SSH: git@github.com:owner/repo.git
    let cleaned = url.replace(/\.git$/, "");

    if (cleaned.includes("@")) {
      // SSH format
      const parts = cleaned.split(":").pop()?.split("/") || [];
      return { owner: parts[0] || "", repo: parts[1] || "" };
    }

    const urlObj = new URL(cleaned);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    return { owner: parts[0] || "", repo: parts[1] || "" };
  }

  private extractProjectPath(url: string, _provider: string): string {
    let cleaned = url.replace(/\.git$/, "");
    if (cleaned.includes("@")) {
      return cleaned.split(":").pop() || "";
    }
    const urlObj = new URL(cleaned);
    return urlObj.pathname.slice(1); // Remove leading /
  }

  private extractAzureInfo(
    url: string
  ): { org: string; project: string; repo: string } {
    // https://dev.azure.com/org/project/_git/repo
    const urlObj = new URL(url.replace(/\.git$/, ""));
    const parts = urlObj.pathname.split("/").filter(Boolean);
    return {
      org: parts[0] || "",
      project: parts[1] || "",
      repo: parts[3] || parts[1] || "",
    };
  }

  // ─── Utility: Read files from working dir ───────────────────────────────

  async readSourceFiles(
    workingDir: WorkingDir
  ): Promise<{ path: string; content: string }[]> {
    const files: { path: string; content: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "target") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          entry.name.endsWith(".java") ||
          entry.name.endsWith(".jsp") ||
          entry.name.endsWith(".xml") ||
          entry.name.endsWith(".properties") ||
          entry.name.endsWith(".yml") ||
          entry.name.endsWith(".yaml")
        ) {
          files.push({
            path: path.relative(workingDir.path, full),
            content: fs.readFileSync(full, "utf-8"),
          });
        }
      }
    };
    walk(workingDir.path);
    return files;
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  async cleanup(workingDir: WorkingDir): Promise<void> {
    fs.rmSync(workingDir.path, { recursive: true, force: true });
  }
}
