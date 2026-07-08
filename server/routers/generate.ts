/**
 * Generation Router — tRPC procedures for triggering code generation.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { generateAdapter, generateAdapterDocumentation, packageAsZip } from "../generators/adapterGenerator";
import { generateBianWrappers, packageBianAsZip } from "../generators/bianGenerator";
import type { BianProject, AdapterEndpoint } from "../generators/bianGenerator";
import { storagePut } from "../storage";
import { UPLOAD_DIR } from "../upload";
import { createProject, updateProjectStatus, createGeneration, updateGeneration, getAllGenerations, getAllProjects } from "../db";

const WORK_DIR = path.join(os.tmpdir(), "ejb-to-rest-gen");

export const generateRouter = router({
  /**
   * List all generations (for the Results page).
   */
  list: publicProcedure.query(async () => {
    const gens = await getAllGenerations();
    const projs = await getAllProjects();
    return { generations: gens, projects: projs };
  }),

  /**
   * Generate an Adapter WAR project from an uploaded EJB ZIP.
   */
  adapter: publicProcedure
    .input(
      z.object({
        filePaths: z.array(z.string()),
        projectName: z.string().optional(),
        groupId: z.string().default("ma.bmce.adapter"),
        artifactId: z.string().optional(),
        basePackage: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { filePaths, projectName, groupId } = input;

      if (filePaths.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No files provided" });
      }

      const results: any[] = [];

      for (const filePath of filePaths) {
        const fileName = path.basename(filePath, path.extname(filePath));
        const name = projectName || fileName;
        const artifactId = input.artifactId || `${name}-adapter`;
        const basePackage = input.basePackage || `${groupId}.${name.replace(/[-_]/g, "")}`;

        const outputDir = path.join(WORK_DIR, `adapter-${Date.now()}-${name}`);
        await fs.mkdir(outputDir, { recursive: true });

        // Determine if input is a ZIP or directory
        let inputPath = filePath;
        const stat = await fs.stat(filePath);
        if (stat.isFile() && filePath.endsWith(".zip")) {
          // Extract ZIP first
          const extractDir = path.join(WORK_DIR, `extract-${Date.now()}-${name}`);
          await fs.mkdir(extractDir, { recursive: true });
          const { execSync } = await import("child_process");
          execSync(`unzip -o -q "${filePath}" -d "${extractDir}"`);
          
          // Find the actual project root (look for src/ or pom.xml)
          const entries = await fs.readdir(extractDir);
          if (entries.length === 1) {
            const subDir = path.join(extractDir, entries[0]);
            const subStat = await fs.stat(subDir);
            if (subStat.isDirectory()) {
              inputPath = subDir;
            } else {
              inputPath = extractDir;
            }
          } else {
            inputPath = extractDir;
          }
        }

        // Run the Java generator
        const result = await generateAdapter({
          inputPath,
          outputDir,
          groupId,
          artifactId,
          basePackage,
        });

        if (result.success) {
          // Generate documentation
          await generateAdapterDocumentation(outputDir, artifactId, result.ejbCount, result.methodCount);

          // Package as ZIP
          const zipPath = path.join(WORK_DIR, `${artifactId}.zip`);
          await packageAsZip(outputDir, zipPath);

          // Upload to S3
          const zipBuffer = await fs.readFile(zipPath);
          const { key, url } = await storagePut(
            `generations/adapter/${artifactId}.zip`,
            zipBuffer,
            "application/zip"
          );

          results.push({
            success: true,
            projectName: artifactId,
            ejbCount: result.ejbCount,
            methodCount: result.methodCount,
            filesGenerated: result.filesGenerated,
            zipUrl: url,
            zipKey: key,
          });

          // Cleanup
          await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
          await fs.rm(zipPath, { force: true }).catch(() => {});
        } else {
          results.push({
            success: false,
            projectName: artifactId,
            ejbCount: 0,
            methodCount: 0,
            filesGenerated: 0,
            zipUrl: null,
            zipKey: null,
            errors: result.errors,
          });
        }
      }

      return { results };
    }),

  /**
   * Generate BIAN Wrapper Spring Boot projects from JSON descriptors.
   */
  bian: publicProcedure
    .input(
      z.object({
        projects: z.array(
          z.object({
            adapterName: z.string(),
            filePath: z.string().optional(),
            endpoints: z.array(
              z.object({
                operation: z.string(),
                method: z.string(),
                path: z.string(),
                requestFields: z.array(z.object({ name: z.string(), type: z.string(), required: z.boolean().optional() })).default([]),
                responseFields: z.array(z.object({ name: z.string(), type: z.string(), required: z.boolean().optional() })).default([]),
              })
            ),
          })
        ),
        groupId: z.string().default("ma.bmce.bian"),
        basePackage: z.string().default("ma.bmce.bian"),
      })
    )
    .mutation(async ({ input }) => {
      const { projects, groupId, basePackage } = input;

      if (projects.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No projects provided" });
      }

      const outputDir = path.join(WORK_DIR, `bian-${Date.now()}`);
      await fs.mkdir(outputDir, { recursive: true });

      const bianProjects: BianProject[] = projects.map((p) => ({
        adapterName: p.adapterName,
        endpoints: p.endpoints as AdapterEndpoint[],
      }));

      const result = await generateBianWrappers({
        projects: bianProjects,
        outputDir,
        groupId,
        basePackage,
      });

      // Package each wrapper as ZIP and upload
      const wrapperResults: any[] = [];
      for (const wrapper of result.wrappers) {
        try {
          const zipPath = path.join(WORK_DIR, `${wrapper.name}.zip`);
          await packageBianAsZip(wrapper.outputDir, zipPath);

          const zipBuffer = await fs.readFile(zipPath);
          const { key, url } = await storagePut(
            `generations/bian/${wrapper.name}.zip`,
            zipBuffer,
            "application/zip"
          );

          // Persist BIAN generation to DB
          const projectId = await createProject({
            userId: 0,
            name: wrapper.name,
            originalFileName: wrapper.name,
            status: 'parsed',
            metadata: { serviceDomain: wrapper.serviceDomain, domainId: wrapper.domainId, endpoints: wrapper.endpoints },
          });
          if (projectId) {
            await createGeneration({
              userId: 0,
              projectId,
              mode: 'bian',
              status: 'completed',
              zipStorageKey: key,
              zipUrl: url,
              stats: { endpoints: wrapper.endpoints, filesGenerated: wrapper.filesGenerated, serviceDomain: wrapper.serviceDomain },
              completedAt: new Date(),
            });
          }

          wrapperResults.push({
            name: wrapper.name,
            serviceDomain: wrapper.serviceDomain,
            domainId: wrapper.domainId,
            endpoints: wrapper.endpoints,
            filesGenerated: wrapper.filesGenerated,
            zipUrl: url,
            zipKey: key,
          });

          await fs.rm(zipPath, { force: true }).catch(() => {});
        } catch (err: any) {
          wrapperResults.push({
            name: wrapper.name,
            serviceDomain: wrapper.serviceDomain,
            domainId: wrapper.domainId,
            endpoints: wrapper.endpoints,
            filesGenerated: wrapper.filesGenerated,
            zipUrl: null,
            zipKey: null,
            error: err.message,
          });
        }
      }

      // Cleanup
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});

      return {
        success: result.success,
        wrappers: wrapperResults,
        errors: result.errors,
      };
    }),

  /**
   * Generate Adapter from uploaded EJB project (simplified - reads from upload path).
   */
  adapterFromUpload: publicProcedure
    .input(
      z.object({
        uploadedFiles: z.array(
          z.object({
            originalName: z.string(),
            storedPath: z.string(),
            format: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const { uploadedFiles } = input;

      // Reuse the adapter generation logic
      const results: any[] = [];

      for (const file of uploadedFiles) {
        const fileName = file.originalName.replace(/\.[^.]+$/, "");
        const artifactId = `${fileName}-adapter`;
        const groupId = "ma.bmce.adapter";
        const basePackage = `ma.bmce.adapter.${fileName.replace(/[-_]/g, "")}`;

        const outputDir = path.join(WORK_DIR, `adapter-${Date.now()}-${fileName}`);
        await fs.mkdir(outputDir, { recursive: true });

        let inputPath = file.storedPath;

        // Extract ZIP if needed
        if (file.format === "zip" || file.format === "jar" || file.format === "war") {
          const extractDir = path.join(WORK_DIR, `extract-${Date.now()}-${fileName}`);
          await fs.mkdir(extractDir, { recursive: true });
          const { execSync } = await import("child_process");
          try {
            execSync(`unzip -o -q "${file.storedPath}" -d "${extractDir}"`, { timeout: 30000 });
          } catch {
            // Try jar for JAR/WAR files
            execSync(`cd "${extractDir}" && jar xf "${file.storedPath}"`, { timeout: 30000 });
          }

          const entries = await fs.readdir(extractDir);
          if (entries.length === 1) {
            const subDir = path.join(extractDir, entries[0]);
            const subStat = await fs.stat(subDir);
            if (subStat.isDirectory()) {
              inputPath = subDir;
            } else {
              inputPath = extractDir;
            }
          } else {
            inputPath = extractDir;
          }
        }

        const genResult = await generateAdapter({
          inputPath,
          outputDir,
          groupId,
          artifactId,
          basePackage,
        });

        if (genResult.success) {
          await generateAdapterDocumentation(outputDir, artifactId, genResult.ejbCount, genResult.methodCount);

          const zipPath = path.join(WORK_DIR, `${artifactId}.zip`);
          await packageAsZip(outputDir, zipPath);

          const zipBuffer = await fs.readFile(zipPath);
          const { key, url } = await storagePut(
            `generations/adapter/${artifactId}.zip`,
            zipBuffer,
            "application/zip"
          );

          // Persist to DB
          const projectId = await createProject({
            userId: 0,
            name: artifactId,
            originalFileName: file.originalName,
            status: 'parsed',
            metadata: { ejbCount: genResult.ejbCount, methodCount: genResult.methodCount },
          });
          if (projectId) {
            await createGeneration({
              userId: 0,
              projectId,
              mode: 'adapter',
              status: 'completed',
              zipStorageKey: key,
              zipUrl: url,
              stats: { ejbCount: genResult.ejbCount, methodCount: genResult.methodCount, filesGenerated: genResult.filesGenerated },
              completedAt: new Date(),
            });
          }

          results.push({
            success: true,
            projectName: artifactId,
            originalName: file.originalName,
            ejbCount: genResult.ejbCount,
            methodCount: genResult.methodCount,
            filesGenerated: genResult.filesGenerated,
            zipUrl: url,
            zipKey: key,
          });

          await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
          await fs.rm(zipPath, { force: true }).catch(() => {});
        } else {
          // Detect non-EJB projects and provide helpful message
          const errorMsg = genResult.errors.join(" ");
          const isNonEjb = errorMsg.includes("No EJB") || errorMsg.includes("no EJB") || genResult.ejbCount === 0;
          results.push({
            success: false,
            projectName: artifactId,
            originalName: file.originalName,
            ejbCount: 0,
            methodCount: 0,
            filesGenerated: 0,
            zipUrl: null,
            zipKey: null,
            errors: genResult.errors,
            isNonEjb,
            hint: isNonEjb
              ? "Ce projet ne contient pas d'annotations EJB (@Stateless, @Remote, @Local). Il utilise probablement Spring (@RestController, @Service) ou des Servlets. Le g\u00e9n\u00e9rateur Adapter ne supporte que les projets EJB."
              : undefined,
          });
        }
      }

      return { results };
    }),
});
