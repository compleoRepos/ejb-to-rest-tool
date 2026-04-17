package com.bank.tools.generator.report;

import com.bank.tools.generator.ai.EnhancementReport;
import com.bank.tools.generator.ai.SmartCodeEnhancer;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import com.lowagie.text.*;
import com.lowagie.text.Font;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Genere un rapport PDF de transformation EJB → REST.
 * Utilise OpenPDF (fork libre d'iText) pour la generation.
 *
 * Le rapport inclut :
 * - Page de garde avec logo Compleo
 * - Resume de l'analyse
 * - Tableau des UseCases et leur mapping REST
 * - Tableau des DTOs generes
 * - Score de qualite SmartCodeEnhancer
 * - Recommandations
 */
@Component
public class ReportPdfGenerator implements TransformationReportGenerator {

    private static final Logger log = LoggerFactory.getLogger(ReportPdfGenerator.class);

    // Couleurs Compleo
    private static final Color COMPLEO_BLUE = new Color(0, 82, 136);
    private static final Color COMPLEO_LIGHT_BLUE = new Color(230, 240, 250);
    private static final Color HEADER_BG = new Color(0, 82, 136);
    private static final Color ROW_ALT_BG = new Color(245, 248, 252);

    // Fonts
    private static final Font TITLE_FONT = new Font(Font.HELVETICA, 24, Font.BOLD, Color.WHITE);
    private static final Font SUBTITLE_FONT = new Font(Font.HELVETICA, 14, Font.NORMAL, Color.WHITE);
    private static final Font HEADING1_FONT = new Font(Font.HELVETICA, 16, Font.BOLD, COMPLEO_BLUE);
    private static final Font HEADING2_FONT = new Font(Font.HELVETICA, 13, Font.BOLD, COMPLEO_BLUE);
    private static final Font BODY_FONT = new Font(Font.HELVETICA, 10, Font.NORMAL, Color.BLACK);
    private static final Font BODY_BOLD = new Font(Font.HELVETICA, 10, Font.BOLD, Color.BLACK);
    private static final Font TABLE_HEADER_FONT = new Font(Font.HELVETICA, 9, Font.BOLD, Color.WHITE);
    private static final Font TABLE_CELL_FONT = new Font(Font.HELVETICA, 9, Font.NORMAL, Color.BLACK);
    private static final Font SCORE_FONT = new Font(Font.HELVETICA, 36, Font.BOLD, COMPLEO_BLUE);
    private static final Font FOOTER_FONT = new Font(Font.HELVETICA, 8, Font.ITALIC, Color.GRAY);

    /**
     * Genere le rapport PDF complet.
     *
     * @param outputPath  Chemin du fichier PDF de sortie
     * @param analysis    Resultat de l'analyse du projet EJB
     * @param enhancement Rapport SmartCodeEnhancer (peut etre null)
     */
    public void generateReport(Path outputPath, ProjectAnalysisResult analysis,
                                EnhancementReport enhancement) throws IOException {
        try {
            Document document = new Document(PageSize.A4, 50, 50, 50, 50);
            PdfWriter.getInstance(document, new FileOutputStream(outputPath.toFile()));
            document.open();

            // Page de garde
            addCoverPage(document, analysis);

            // Resume executif
            document.newPage();
            addExecutiveSummary(document, analysis, enhancement);

            // Tableau des UseCases
            document.newPage();
            addUseCaseTable(document, analysis);

            // Tableau des DTOs
            if (!analysis.getDtos().isEmpty()) {
                document.newPage();
                addDtoTable(document, analysis);
            }

            // Score qualite
            if (enhancement != null) {
                document.newPage();
                addQualityScore(document, enhancement);
            }

            // Recommandations
            document.newPage();
            addRecommendations(document, analysis);

            document.close();
            log.info("[PDF] Rapport genere : {}", outputPath);
        } catch (DocumentException e) {
            throw new IOException("Erreur lors de la generation du rapport PDF", e);
        }
    }

    private void addCoverPage(Document document, ProjectAnalysisResult analysis) throws DocumentException {
        // Espace superieur
        document.add(new Paragraph("\n\n\n\n\n"));

        // Bandeau bleu
        PdfPTable banner = new PdfPTable(1);
        banner.setWidthPercentage(100);
        PdfPCell bannerCell = new PdfPCell();
        bannerCell.setBackgroundColor(COMPLEO_BLUE);
        bannerCell.setPadding(30);
        bannerCell.setBorder(0);

        Paragraph title = new Paragraph("Rapport de Transformation\nEJB → REST API", TITLE_FONT);
        title.setAlignment(Element.ALIGN_CENTER);
        bannerCell.addElement(title);

        Paragraph subtitle = new Paragraph("\nCompleo — EJB-to-REST Generator v3.0", SUBTITLE_FONT);
        subtitle.setAlignment(Element.ALIGN_CENTER);
        bannerCell.addElement(subtitle);

        banner.addCell(bannerCell);
        document.add(banner);

        // Informations du projet
        document.add(new Paragraph("\n\n\n"));

        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        PdfPTable infoTable = new PdfPTable(2);
        infoTable.setWidthPercentage(60);
        infoTable.setHorizontalAlignment(Element.ALIGN_CENTER);
        infoTable.setWidths(new float[]{1, 2});

        addInfoRow(infoTable, "Date", date);
        addInfoRow(infoTable, "Package source", analysis.getSourceBasePackage() != null ? analysis.getSourceBasePackage() : "auto-detecte");
        addInfoRow(infoTable, "UseCases", String.valueOf(analysis.getUseCases().size()));
        addInfoRow(infoTable, "DTOs", String.valueOf(analysis.getDtos().size()));
        addInfoRow(infoTable, "Exceptions", String.valueOf(analysis.getDetectedExceptions().size()));

        document.add(infoTable);

        // Footer
        document.add(new Paragraph("\n\n\n\n\n\n"));
        Paragraph footer = new Paragraph("Document confidentiel — Compleo", FOOTER_FONT);
        footer.setAlignment(Element.ALIGN_CENTER);
        document.add(footer);
    }

    private void addInfoRow(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, BODY_BOLD));
        labelCell.setBorder(0);
        labelCell.setPadding(5);
        labelCell.setBackgroundColor(COMPLEO_LIGHT_BLUE);
        table.addCell(labelCell);

        PdfPCell valueCell = new PdfPCell(new Phrase(value, BODY_FONT));
        valueCell.setBorder(0);
        valueCell.setPadding(5);
        table.addCell(valueCell);
    }

    private void addExecutiveSummary(Document document, ProjectAnalysisResult analysis,
                                      EnhancementReport enhancement) throws DocumentException {
        Paragraph heading = new Paragraph("1. Resume Executif", HEADING1_FONT);
        heading.setSpacingAfter(15);
        document.add(heading);

        long stateless = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATELESS).count();
        long stateful = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count();
        long mdb = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN).count();
        long bianMapped = analysis.getUseCases().stream()
                .filter(uc -> uc.getBianMapping() != null).count();

        document.add(new Paragraph("L'outil EJB-to-REST Generator a analyse le projet EJB source et genere " +
                "un projet Spring Boot 3.2 complet. Voici les metriques cles :", BODY_FONT));
        document.add(new Paragraph("\n"));

        PdfPTable metricsTable = new PdfPTable(2);
        metricsTable.setWidthPercentage(80);
        metricsTable.setWidths(new float[]{2, 1});

        addMetricRow(metricsTable, "EJB @Stateless detectes", String.valueOf(stateless));
        addMetricRow(metricsTable, "EJB @Stateful detectes", String.valueOf(stateful));
        addMetricRow(metricsTable, "EJB @MessageDriven detectes", String.valueOf(mdb));
        addMetricRow(metricsTable, "DTOs generes", String.valueOf(analysis.getDtos().size()));
        addMetricRow(metricsTable, "Exceptions custom", String.valueOf(analysis.getDetectedExceptions().size()));
        addMetricRow(metricsTable, "Enums recopies", String.valueOf(analysis.getDetectedEnums().size()));
        addMetricRow(metricsTable, "Validateurs custom", String.valueOf(analysis.getDetectedValidators().size()));
        addMetricRow(metricsTable, "UseCases mappes BIAN", String.valueOf(bianMapped));

        if (enhancement != null) {
            addMetricRow(metricsTable, "Score qualite", enhancement.getTotalRulesApplied() + "/" + enhancement.getTotalRulesChecked());
        }

        document.add(metricsTable);

        document.add(new Paragraph("\n"));
        Paragraph techStack = new Paragraph("2. Stack Technique Generee", HEADING1_FONT);
        techStack.setSpacingAfter(15);
        document.add(techStack);

        PdfPTable stackTable = new PdfPTable(2);
        stackTable.setWidthPercentage(80);
        stackTable.setWidths(new float[]{1, 2});

        addMetricRow(stackTable, "Framework", "Spring Boot 3.2.5");
        addMetricRow(stackTable, "Java", "21");
        addMetricRow(stackTable, "Build", "Maven");
        addMetricRow(stackTable, "API Documentation", "OpenAPI 3.0 / Swagger UI");
        addMetricRow(stackTable, "Serialisation", "Jackson (JSON) + JAXB (XML)");
        addMetricRow(stackTable, "Validation", "Jakarta Bean Validation");
        addMetricRow(stackTable, "Architecture", "ACL (Anti-Corruption Layer)");

        document.add(stackTable);
    }

    private void addMetricRow(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, BODY_FONT));
        labelCell.setPadding(6);
        labelCell.setBorderColor(Color.LIGHT_GRAY);
        table.addCell(labelCell);

        PdfPCell valueCell = new PdfPCell(new Phrase(value, BODY_BOLD));
        valueCell.setPadding(6);
        valueCell.setBorderColor(Color.LIGHT_GRAY);
        valueCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        table.addCell(valueCell);
    }

    private void addUseCaseTable(Document document, ProjectAnalysisResult analysis) throws DocumentException {
        Paragraph heading = new Paragraph("3. Mapping des UseCases", HEADING1_FONT);
        heading.setSpacingAfter(15);
        document.add(heading);

        document.add(new Paragraph("Le tableau suivant presente le mapping entre les EJB source et les endpoints REST generes.", BODY_FONT));
        document.add(new Paragraph("\n"));

        PdfPTable table = new PdfPTable(5);
        table.setWidthPercentage(100);
        table.setWidths(new float[]{2.5f, 1, 1.5f, 2.5f, 1});

        // Headers
        addTableHeader(table, "UseCase EJB");
        addTableHeader(table, "Type");
        addTableHeader(table, "Pattern");
        addTableHeader(table, "Endpoint REST");
        addTableHeader(table, "HTTP");

        // Rows
        int row = 0;
        for (UseCaseInfo uc : analysis.getUseCases()) {
            Color bg = (row % 2 == 0) ? Color.WHITE : ROW_ALT_BG;
            String httpMethod = resolveHttpMethod(uc);

            addTableCell(table, uc.getClassName(), bg);
            addTableCell(table, uc.getEjbType() != null ? uc.getEjbType().name() : "Stateless", bg);
            addTableCell(table, uc.getEjbPattern() != null ? uc.getEjbPattern().name() : "BASE_USE_CASE", bg);
            addTableCell(table, uc.getRestEndpoint(), bg);
            addTableCell(table, httpMethod, bg);
            row++;
        }

        document.add(table);
    }

    private void addDtoTable(Document document, ProjectAnalysisResult analysis) throws DocumentException {
        Paragraph heading = new Paragraph("4. DTOs Generes", HEADING1_FONT);
        heading.setSpacingAfter(15);
        document.add(heading);

        PdfPTable table = new PdfPTable(4);
        table.setWidthPercentage(100);
        table.setWidths(new float[]{2.5f, 1, 1, 1});

        addTableHeader(table, "Classe DTO");
        addTableHeader(table, "Champs");
        addTableHeader(table, "JAXB");
        addTableHeader(table, "Serializable");

        int row = 0;
        for (DtoInfo dto : analysis.getDtos()) {
            Color bg = (row % 2 == 0) ? Color.WHITE : ROW_ALT_BG;
            boolean isSerializable = dto.getClassName().endsWith("VoIn") || dto.getClassName().endsWith("VoOut")
                    || dto.getClassName().endsWith("Dto") || dto.getClassName().endsWith("DTO");

            addTableCell(table, dto.getClassName(), bg);
            addTableCell(table, String.valueOf(dto.getFields().size()), bg);
            addTableCell(table, dto.isHasXmlRootElement() ? "Oui" : "Non", bg);
            addTableCell(table, isSerializable ? "Oui" : "Non", bg);
            row++;
        }

        document.add(table);
    }

    private void addQualityScore(Document document, EnhancementReport enhancement) throws DocumentException {
        Paragraph heading = new Paragraph("5. Score de Qualite SmartCodeEnhancer", HEADING1_FONT);
        heading.setSpacingAfter(15);
        document.add(heading);

        document.add(new Paragraph("Le SmartCodeEnhancer applique un ensemble de regles d'amelioration " +
                "post-generation pour garantir la qualite du code produit.", BODY_FONT));
        document.add(new Paragraph("\n\n"));

        // Score en grand
        Paragraph score = new Paragraph(
                enhancement.getTotalRulesApplied() + " / " + enhancement.getTotalRulesChecked(),
                SCORE_FONT);
        score.setAlignment(Element.ALIGN_CENTER);
        document.add(score);

        Paragraph scoreLabel = new Paragraph("regles appliquees", HEADING2_FONT);
        scoreLabel.setAlignment(Element.ALIGN_CENTER);
        scoreLabel.setSpacingAfter(20);
        document.add(scoreLabel);

        // Pourcentage
        int pct = enhancement.getTotalRulesChecked() > 0
                ? (enhancement.getTotalRulesApplied() * 100 / enhancement.getTotalRulesChecked()) : 0;
        Paragraph pctParagraph = new Paragraph("Score : " + pct + "%", HEADING2_FONT);
        pctParagraph.setAlignment(Element.ALIGN_CENTER);
        document.add(pctParagraph);
    }

    private void addRecommendations(Document document, ProjectAnalysisResult analysis) throws DocumentException {
        Paragraph heading = new Paragraph("6. Recommandations", HEADING1_FONT);
        heading.setSpacingAfter(15);
        document.add(heading);

        addRecommendation(document, "1. Tests d'integration",
                "Executer les tests en mode mock pour valider le comportement des endpoints generes " +
                "avant de connecter au serveur EJB reel.");

        addRecommendation(document, "2. Configuration JNDI",
                "Adapter les proprietes ejb.jndi.provider-url et ejb.jndi.factory dans " +
                "application.properties pour pointer vers le serveur d'applications cible.");

        addRecommendation(document, "3. Securite",
                "Verifier les annotations @PreAuthorize generees et adapter les roles " +
                "selon la politique de securite de l'environnement cible.");

        long stateful = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count();
        if (stateful > 0) {
            addRecommendation(document, "4. EJB @Stateful",
                    stateful + " EJB @Stateful detecte(s). L'etat conversationnel n'est pas reproduit " +
                    "dans la facade REST. Prevoir une gestion d'etat via session HTTP ou cache distribue.");
        }

        addRecommendation(document, "5. Monitoring",
                "Le LoggingAspect genere trace automatiquement les appels REST. " +
                "Configurer un collecteur de logs (ELK, Splunk) pour le suivi en production.");

        // Footer
        document.add(new Paragraph("\n\n\n"));
        Paragraph footer = new Paragraph(
                "Rapport genere par EJB-to-REST Generator v3.0 — Compleo — " +
                LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy")),
                FOOTER_FONT);
        footer.setAlignment(Element.ALIGN_CENTER);
        document.add(footer);
    }

    private void addRecommendation(Document document, String title, String body) throws DocumentException {
        Paragraph recTitle = new Paragraph(title, HEADING2_FONT);
        recTitle.setSpacingBefore(10);
        document.add(recTitle);

        Paragraph recBody = new Paragraph(body, BODY_FONT);
        recBody.setSpacingAfter(10);
        recBody.setIndentationLeft(20);
        document.add(recBody);
    }

    private void addTableHeader(PdfPTable table, String text) {
        PdfPCell cell = new PdfPCell(new Phrase(text, TABLE_HEADER_FONT));
        cell.setBackgroundColor(HEADER_BG);
        cell.setPadding(6);
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        table.addCell(cell);
    }

    private void addTableCell(PdfPTable table, String text, Color bg) {
        PdfPCell cell = new PdfPCell(new Phrase(text != null ? text : "-", TABLE_CELL_FONT));
        cell.setBackgroundColor(bg);
        cell.setPadding(5);
        cell.setBorderColor(Color.LIGHT_GRAY);
        table.addCell(cell);
    }

    private String resolveHttpMethod(UseCaseInfo uc) {
        if (uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) return "POST (async)";
        String lower = uc.getClassName().toLowerCase();
        if (lower.contains("get") || lower.contains("find") || lower.contains("search") ||
            lower.contains("consult") || lower.contains("list") || lower.contains("retrieve")) return "GET";
        if (lower.contains("update") || lower.contains("modifier") || lower.contains("maj")) return "PUT";
        if (lower.contains("delete") || lower.contains("supprimer")) return "DELETE";
        return "POST";
    }
}
