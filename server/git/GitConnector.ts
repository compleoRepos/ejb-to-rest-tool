/**
 * GitConnector — Connecteur Git multi-providers.
 * Supporte GitHub, GitLab, Azure DevOps, Gitea, et Git bare.
 *
 * Utilise isomorphic-git (pure JS, pas besoin du binaire git)
 * pour toutes les opérations : clone, branch, commit, push.
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

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import git from "isomorphic-git";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const http = _require("isomorphic-git/http/node");

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

  // ─── clone (isomorphic-git — pure JS, no git binary needed) ─────────────

  async clone(
    url: string,
    token?: string,
    targetDir?: string
  ): Promise<CloneResult> {
    const dir = targetDir || path.join(os.tmpdir(), `compleo-git-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });

    const effectiveToken = token || this.config.token;

    // Build auth headers for isomorphic-git
    const onAuth = effectiveToken
      ? () => this.buildIsomorphicAuth(effectiveToken)
      : undefined;

    // isomorphic-git only supports http/https — local paths use fs copy
    const isLocalPath = url.startsWith("/") || url.startsWith(".");

    if (isLocalPath) {
      // Local clone: copy directory recursively
      const resolvedSrc = path.resolve(url);
      this.copyDirRecursive(resolvedSrc, dir);
    } else {
      // Remote clone with isomorphic-git (depth 1 for speed)
      await git.clone({
        fs,
        http,
        dir,
        url,
        depth: 1,
        singleBranch: true,
        onAuth,
      });
    }

    // Detect default branch
    let defaultBranch = "main";
    try {
      const currentBranch = await git.currentBranch({ fs, dir });
      if (currentBranch) defaultBranch = currentBranch;
    } catch {
      // Fallback to main if branch detection fails
    }

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
          if (
            entry.name.endsWith(".java") ||
            entry.name.endsWith(".jsp") ||
            entry.name.endsWith(".xml")
          ) {
            javaFileCount++;
          }
        }
      }
    };
    countFiles(dir);

    return {
      path: dir,
      repoUrl: url,
      defaultBranch,
      fileCount,
      javaFileCount,
    };
  }

  // ─── createBranch (isomorphic-git) ──────────────────────────────────────

  async createBranch(workingDir: WorkingDir, branchName: string): Promise<void> {
    await git.branch({ fs, dir: workingDir.path, ref: branchName });
    await git.checkout({ fs, dir: workingDir.path, ref: branchName });
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
    // Stage all changes with isomorphic-git
    await git.add({ fs, dir: workingDir.path, filepath: "." });
    return written;
  }

  // ─── commit (isomorphic-git) ────────────────────────────────────────────

  async commit(workingDir: WorkingDir, message: string): Promise<string> {
    const sha = await git.commit({
      fs,
      dir: workingDir.path,
      message,
      author: {
        name: "Compleo Agent",
        email: "compleo@migration.tool",
      },
    });
    return sha;
  }

  // ─── push (isomorphic-git) ──────────────────────────────────────────────

  async push(workingDir: WorkingDir, branchName?: string): Promise<void> {
    const branch =
      branchName ||
      (await git.currentBranch({ fs, dir: workingDir.path })) ||
      "main";

    const effectiveToken = this.config.token;
    const onAuth = effectiveToken
      ? () => this.buildIsomorphicAuth(effectiveToken)
      : undefined;

    await git.push({
      fs,
      http,
      dir: workingDir.path,
      remote: "origin",
      ref: branch,
      onAuth,
    });
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
        throw new Error(
          "Git bare ne supporte pas la création de PR. Utilisez push seulement."
        );
      default:
        throw new Error(`Provider non supporté: ${this.config.provider}`);
    }
  }

  // ─── GitHub PR ──────────────────────────────────────────────────────────

  private async createGitHubPR(config: PRConfig): Promise<PRResult> {
    const apiUrl = this.config.apiUrl || "https://api.github.com";
    const { owner, repo } = this.extractOwnerRepo(
      config.workingDir.repoUrl,
      "github"
    );

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
      throw new Error(
        `GitHub PR creation failed (${response.status}): ${error}`
      );
    }

    const data = (await response.json()) as any;
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
    const projectPath = this.extractProjectPath(
      config.workingDir.repoUrl,
      "gitlab"
    );
    const encodedPath = encodeURIComponent(projectPath);

    const response = await fetch(
      `${apiUrl}/projects/${encodedPath}/merge_requests`,
      {
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
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `GitLab MR creation failed (${response.status}): ${error}`
      );
    }

    const data = (await response.json()) as any;
    return {
      url: data.web_url,
      number: data.iid,
      provider: "gitlab",
      state: "open",
    };
  }

  // ─── Azure DevOps PR ────────────────────────────────────────────────────

  private async createAzurePR(config: PRConfig): Promise<PRResult> {
    const { org, project, repo } = this.extractAzureInfo(
      config.workingDir.repoUrl
    );
    const apiUrl =
      this.config.apiUrl ||
      `https://dev.azure.com/${org}/${project}/_apis`;

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
      throw new Error(
        `Azure DevOps PR creation failed (${response.status}): ${error}`
      );
    }

    const data = (await response.json()) as any;
    return {
      url: `https://dev.azure.com/${org}/${project}/_git/${repo}/pullrequest/${data.pullRequestId}`,
      number: data.pullRequestId,
      provider: "azure",
      state: "created",
    };
  }

  // ─── Gitea PR ───────────────────────────────────────────────────────────

  private async createGiteaPR(config: PRConfig): Promise<PRResult> {
    const apiUrl =
      this.config.apiUrl || "https://gitea.example.com/api/v1";
    const { owner, repo } = this.extractOwnerRepo(
      config.workingDir.repoUrl,
      "gitea"
    );

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
      throw new Error(
        `Gitea PR creation failed (${response.status}): ${error}`
      );
    }

    const data = (await response.json()) as any;
    return {
      url: data.html_url,
      number: data.number,
      provider: "gitea",
      state: "open",
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private buildIsomorphicAuth(token: string): {
    username: string;
    password: string;
  } {
    if (this.config.provider === "gitlab") {
      return { username: "oauth2", password: token };
    }
    if (this.config.provider === "azure") {
      return { username: "", password: token };
    }
    // GitHub, Gitea
    return { username: token, password: "x-oauth-basic" };
  }

  private extractOwnerRepo(
    url: string,
    _provider: string
  ): { owner: string; repo: string } {
    let cleaned = url.replace(/\.git$/, "");

    if (cleaned.includes("@")) {
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
    return urlObj.pathname.slice(1);
  }

  private extractAzureInfo(
    url: string
  ): { org: string; project: string; repo: string } {
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
        if (
          entry.name === ".git" ||
          entry.name === "node_modules" ||
          entry.name === "target"
        )
          continue;
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

  // ─── Local copy (for local path cloning) ────────────────────────────────

  private copyDirRecursive(src: string, dest: string): void {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  async cleanup(workingDir: WorkingDir): Promise<void> {
    fs.rmSync(workingDir.path, { recursive: true, force: true });
  }
}
