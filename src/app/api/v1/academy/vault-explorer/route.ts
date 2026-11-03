import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/academy/vault-explorer — a developer's browser over the raw
 * academy question bank on disk (the «مستعرض بنك الأسئلة» tab of
 * /academy/quiz, which also asks it for a section sample when a quiz starts).
 *
 * Owner note ١٣ C06: it answered anyone, signed in or not, and echoed the
 * server's error text. VAULT_DIR is a hard-coded Windows path on one
 * developer's machine, so on the production server it never existed and the
 * route served nothing (404) — but on any machine where it exists it handed
 * the whole bank to a guest. Now: platform admins only (requireAdmin, the
 * same check as every /api/v1/admin route), a generic error, nothing echoed.
 * The quiz page already treats a refused call as "no vault questions" and
 * falls back to its built-in bank, so nothing changes for a learner.
 */

const VAULT_DIR = "D:\\Data\\Data\\antigravity ai\\أكاديمية_نظامي\\02_بنك_الأسئلة_المفروز_بالأقسام_الـ30";
const PROGRESS_FILE = "D:\\Data\\Data\\antigravity ai\\أكاديمية_نظامي\\PROGRESS_ACADEMY.json";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) {
    return NextResponse.json({ error: admin.error ?? "غير مصرح" }, { status: admin.status ?? 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section"); // e.g. "00" or "04"
    const law = searchParams.get("law"); // e.g. "نظام_الإثبات"

    // If no params, return list of available sections and their laws
    if (!section) {
      if (!fs.existsSync(VAULT_DIR)) {
        return NextResponse.json({ error: "Vault directory not found" }, { status: 404 });
      }

      const sections = fs.readdirSync(VAULT_DIR).filter(f => fs.statSync(path.join(VAULT_DIR, f)).isDirectory());
      const sectionTree = sections.map(secName => {
        const secPath = path.join(VAULT_DIR, secName);
        const files = fs.readdirSync(secPath).filter(f => f.endsWith(".json"));
        return {
          id: secName.substring(0, 2),
          folderName: secName,
          lawsCount: files.length,
          laws: files.map(f => ({
            slug: f.replace("_questions.json", "").replace(".json", ""),
            fileName: f
          }))
        };
      });

      let progress = null;
      if (fs.existsSync(PROGRESS_FILE)) {
        progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
      }

      return NextResponse.json({ sections: sectionTree, progress });
    }

    // Find target section folder
    const allSecs = fs.readdirSync(VAULT_DIR);
    const targetFolder = allSecs.find(f => f.startsWith(section + "_") || f.startsWith(section + " "));
    if (!targetFolder) {
      return NextResponse.json({ error: `Section ${section} not found` }, { status: 404 });
    }

    const secDirPath = path.join(VAULT_DIR, targetFolder);
    const jsonFiles = fs.readdirSync(secDirPath).filter(f => f.endsWith(".json"));

    // If a specific law is requested
    if (law) {
      const targetFile = jsonFiles.find(f => f.includes(law) || f.replace(".json", "") === law);
      if (!targetFile) {
        return NextResponse.json({ error: `Law ${law} not found in section ${section}` }, { status: 404 });
      }
      const data = JSON.parse(fs.readFileSync(path.join(secDirPath, targetFile), "utf-8"));
      return NextResponse.json({
        section: targetFolder,
        lawFile: targetFile,
        count: Array.isArray(data) ? data.length : 0,
        questions: data
      });
    }

    // Return sample from all laws in this section
    let totalQuestions = 0;
    const lawsSummary = [];
    let sampleQuestions: any[] = [];

    for (const f of jsonFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(secDirPath, f), "utf-8"));
        if (Array.isArray(content)) {
          totalQuestions += content.length;
          lawsSummary.push({
            lawFile: f,
            lawSlug: f.replace("_questions.json", ""),
            count: content.length,
            sample: content.slice(0, 2)
          });
          sampleQuestions = sampleQuestions.concat(content.slice(0, 5));
        }
      } catch {}
    }

    return NextResponse.json({
      section: targetFolder,
      totalLaws: jsonFiles.length,
      totalQuestions,
      lawsSummary,
      sampleQuestions: sampleQuestions.slice(0, 50)
    });
  } catch (err: unknown) {
    console.error("[academy/vault-explorer] failed:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "تعذّر قراءة بنك الأسئلة." }, { status: 500 });
  }
}
