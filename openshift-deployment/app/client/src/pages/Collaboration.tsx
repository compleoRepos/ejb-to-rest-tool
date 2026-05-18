/**
 * Collaboration — Commentaires, validation, partage de rapports.
 * @author Compleo
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  MessageSquare, CheckCircle2, XCircle, Clock, Send, Share2,
  User, Link2, Copy, Loader2, Plus, Filter, ThumbsUp, ThumbsDown,
  FileText, AlertTriangle,
} from "lucide-react";

// ============================================================
// Main Component
// ============================================================

export default function CollaborationPage({ projectId }: { projectId: number }) {
  const { data: project } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: comments, refetch: refetchComments } = trpc.comments.list.useQuery({ projectId });
  const { data: sharedReports, refetch: refetchShared } = trpc.sharing.list.useQuery({ projectId });

  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => { refetchComments(); toast.success("Commentaire ajouté"); },
  });
  const updateValidation = trpc.comments.updateValidation.useMutation({
    onSuccess: () => { refetchComments(); toast.success("Validation mise à jour"); },
  });
  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: () => { refetchComments(); toast.success("Commentaire supprimé"); },
  });
  const createShare = trpc.sharing.create.useMutation({
    onSuccess: () => { refetchShared(); toast.success("Lien de partage créé"); },
  });

  const [activeTab, setActiveTab] = useState("comments");
  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [commentType, setCommentType] = useState<"general" | "review" | "validation" | "question">("general");
  const [shareTitle, setShareTitle] = useState("");

  const commentTypeConfig = {
    general: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", label: "Général" },
    review: { color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", label: "Revue" },
    validation: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Validation" },
    question: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Question" },
  };

  const validationConfig = {
    pending: { color: "text-muted-foreground", icon: Clock, label: "En attente" },
    approved: { color: "text-emerald-400", icon: CheckCircle2, label: "Approuvé" },
    rejected: { color: "text-red-400", icon: XCircle, label: "Rejeté" },
  };

  const handleSubmitComment = () => {
    if (!newComment.trim() || !authorName.trim()) {
      toast.error("Veuillez remplir le nom et le commentaire");
      return;
    }
    createComment.mutate({
      projectId,
      authorName: authorName.trim(),
      content: newComment.trim(),
      commentType,
    });
    setNewComment("");
  };

  const handleCreateShare = () => {
    if (!shareTitle.trim()) {
      toast.error("Veuillez saisir un titre pour le rapport partagé");
      return;
    }
    createShare.mutate({
      projectId,
      title: shareTitle.trim(),
    });
    setShareTitle("");
  };

  const handleCopyShareLink = (token: string) => {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Lien copié dans le presse-papier");
  };

  const stats = useMemo(() => {
    if (!comments) return null;
    return {
      total: comments.length,
      pending: comments.filter((c: any) => c.validationStatus === "pending").length,
      approved: comments.filter((c: any) => c.validationStatus === "approved").length,
      rejected: comments.filter((c: any) => c.validationStatus === "rejected").length,
    };
  }, [comments]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-secondary/20">
        <MessageSquare className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-semibold">Collaboration — {project?.name || "Projet"}</span>
        {stats && (
          <div className="flex items-center gap-2 ml-4">
            <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-0">{stats.total} commentaire(s)</Badge>
            <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-0">{stats.approved} approuvé(s)</Badge>
            <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-0">{stats.pending} en attente</Badge>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="h-9 border-b border-border flex items-center px-2 shrink-0 bg-secondary/10">
          <TabsList className="h-7 bg-transparent p-0 gap-0">
            <TabsTrigger value="comments" className="h-7 text-xs px-3 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-purple-500 text-muted-foreground">
              <MessageSquare className="w-3.5 h-3.5 mr-1" />Commentaires
            </TabsTrigger>
            <TabsTrigger value="sharing" className="h-7 text-xs px-3 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-cyan-500 text-muted-foreground">
              <Share2 className="w-3.5 h-3.5 mr-1" />Partage
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Comments Tab */}
        <TabsContent value="comments" className="flex-1 m-0 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {(!comments || comments.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm">Aucun commentaire pour ce projet</p>
                  <p className="text-[11px] text-muted-foreground/60">Ajoutez des commentaires, revues et validations ci-dessous</p>
                </div>
              ) : (
                comments.map((comment: any) => {
                  const typeConf = commentTypeConfig[comment.commentType as keyof typeof commentTypeConfig] || commentTypeConfig.general;
                  const valConf = validationConfig[comment.validationStatus as keyof typeof validationConfig] || validationConfig.pending;
                  const ValIcon = valConf.icon;
                  return (
                    <div key={comment.id} className={`rounded-lg border ${typeConf.border} ${typeConf.bg} p-4`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-xs font-semibold text-foreground">{comment.authorName}</span>
                        <Badge variant="outline" className={`text-[9px] h-4 ${typeConf.border} ${typeConf.color}`}>{typeConf.label}</Badge>
                        <div className="flex items-center gap-1 ml-auto">
                          <ValIcon className={`w-3.5 h-3.5 ${valConf.color}`} />
                          <span className={`text-[10px] ${valConf.color}`}>{valConf.label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground/60">
                          {new Date(comment.createdAt).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{comment.content}</p>
                      {comment.filePath && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-mono text-muted-foreground">{comment.filePath}{comment.lineNumber ? `:${comment.lineNumber}` : ""}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => updateValidation.mutate({ id: comment.id, validationStatus: "approved" })}
                        >
                          <ThumbsUp className="w-3 h-3" />Approuver
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => updateValidation.mutate({ id: comment.id, validationStatus: "rejected" })}
                        >
                          <ThumbsDown className="w-3 h-3" />Rejeter
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-destructive ml-auto"
                          onClick={() => deleteComment.mutate({ id: comment.id })}
                        >
                          <XCircle className="w-3 h-3" />Supprimer
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* New comment form */}
          <div className="border-t border-border p-4 bg-secondary/10 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder="Votre nom..."
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="h-7 px-2 text-xs bg-secondary border border-border rounded flex-1 max-w-[200px] outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
              />
              <select
                value={commentType}
                onChange={(e) => setCommentType(e.target.value as any)}
                className="h-7 px-2 text-xs bg-secondary border border-border rounded outline-none focus:border-primary text-foreground"
              >
                <option value="general">Général</option>
                <option value="review">Revue</option>
                <option value="validation">Validation</option>
                <option value="question">Question</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <textarea
                placeholder="Écrivez un commentaire..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
                className="flex-1 px-3 py-2 text-xs bg-secondary border border-border rounded resize-none outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
              />
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={handleSubmitComment}
                disabled={createComment.isPending}
              >
                {createComment.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Envoyer
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Sharing Tab */}
        <TabsContent value="sharing" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Create share */}
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />Créer un lien de partage
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Titre du rapport partagé..."
                    value={shareTitle}
                    onChange={(e) => setShareTitle(e.target.value)}
                    className="flex-1 h-8 px-3 text-xs bg-secondary border border-border rounded outline-none focus:border-cyan-500 text-foreground placeholder:text-muted-foreground"
                  />
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white"
                    onClick={handleCreateShare}
                    disabled={createShare.isPending}
                  >
                    {createShare.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    Partager
                  </Button>
                </div>
              </div>

              {/* Shared reports list */}
              <div>
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-cyan-400" />Liens partagés ({sharedReports?.length || 0})
                </h3>
                {(!sharedReports || sharedReports.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                    <Share2 className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-xs">Aucun rapport partagé</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sharedReports.map((report: any) => (
                      <div key={report.id} className="rounded-md border border-border bg-secondary/20 p-3 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground">{report.title}</div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            {window.location.origin}/shared/{report.shareToken}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(report.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleCopyShareLink(report.shareToken)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
