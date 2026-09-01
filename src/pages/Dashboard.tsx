"use client";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Video,
  AlertCircle,
  Eye,
  BookOpen,
} from "lucide-react";

interface Video {
  _id: string;
  videoId: string;
  title: string;
  url: string;
  sourceType: string;
  status: string;
  ingestDate: string;
  chunkCount: number;
  transcript?: string;
  transcriptPreview?: string;
}

interface SeedStatus {
  totalInList: number;
  inDatabase: number;
  pending: number;
  seeded: number;
  currentVideo?: string;
  progress?: number;
}

// Use local backend in development, production URL in production
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:5001"
  : "https://bhakti-marg-gyan.onrender.com";

const Dashboard = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form state
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [bulkUrls, setBulkUrls] = useState("");
  const [seedStatus, setSeedStatus] = useState<SeedStatus | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Modal state
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [viewTranscript, setViewTranscript] = useState(false);
  const [fullTranscript, setFullTranscript] = useState<string>("");

  useEffect(() => {
    fetchVideos();
    fetchSeedStatus();
    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      fetchVideos();
      fetchSeedStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchSeedStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/seed/status`);
      const data = await res.json();
      if (data.success) setSeedStatus(data);
    } catch (err) {
      console.error("Failed to fetch seed status:", err);
    }
  };

  const triggerSeed = async () => {
    if (!confirm("This will ingest all videos in the seed list one by one. Continue?")) return;
    try {
      setSeeding(true);
      const res = await fetch(`${API_BASE}/api/seed`);
      const data = await res.json();
      showToast(data.success ? "success" : "error", data.message || JSON.stringify(data));
      await fetchVideos();
      await fetchSeedStatus();
    } catch (err) {
      showToast("error", "Failed to trigger seed");
    } finally {
      setSeeding(false);
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ingest/videos`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setVideos(data.videos || []);
    } catch (err) {
      console.error("Error fetching videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFullTranscript = async (videoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/ingest/videos/${videoId}`);
      const data = await res.json();
      if (data.success) {
        setFullTranscript(data.transcript || "No transcript available");
      }
    } catch (err) {
      setFullTranscript("Failed to load transcript");
    }
  };

  const ingestVideo = async (url: string, title: string) => {
    try {
      setIngesting(true);
      const res = await fetch(`${API_BASE}/api/ingest/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: url, videoUrl, title: title || url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      showToast("success", `✅ Ingested: ${data.videoId} (${data.chunkCount} chunks)`);
      setVideoUrl("");
      setVideoTitle("");
      await fetchVideos();
      await fetchSeedStatus();
    } catch (err: any) {
      showToast("error", err.message || "Failed to ingest video");
    } finally {
      setIngesting(false);
    }
  };

  const ingestBulk = async () => {
    const urls = bulkUrls.split("\n").filter((u) => u.trim());
    if (urls.length === 0) {
      showToast("error", "Please enter at least one URL");
      return;
    }
    for (const url of urls) {
      await ingestVideo(url.trim(), "");
    }
    setBulkUrls("");
  };

  const deleteVideo = async (videoId: string) => {
    if (!confirm("Delete this video?")) return;
    try {
      setDeleting(videoId);
      const res = await fetch(`${API_BASE}/api/ingest/videos/${videoId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      showToast("success", "Video deleted");
      await fetchVideos();
    } catch (err) {
      showToast("error", "Failed to delete video");
    } finally {
      setDeleting(null);
    }
  };

  const openTranscriptModal = async (video: Video) => {
    setSelectedVideo(video);
    setViewTranscript(true);
    await fetchFullTranscript(video.videoId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <Navbar />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg border backdrop-blur-md max-w-md ${
            toast.type === "success"
              ? "bg-green-500/20 border-green-400 text-green-100"
              : "bg-red-500/20 border-red-400 text-red-100"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Video Dashboard
            </h1>
            <p className="text-muted-foreground">
              Manage and ingest YouTube videos for the knowledge base
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {seedStatus && (
              <div className="flex items-center gap-3 mr-4">
                <span className="text-sm text-muted-foreground">
                  Seeded: <strong className="text-primary">{seedStatus.seeded}/{seedStatus.totalInList}</strong>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={triggerSeed}
                  disabled={seeding || seedStatus.pending === 0}
                >
                  {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Video className="w-4 h-4 mr-2" />}
                  {seeding ? "Seeding..." : `Seed ${seedStatus.pending} Pending`}
                </Button>
              </div>
            )}
            <Button onClick={fetchVideos} variant="outline" disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Seeding Progress Banner */}
        {seeding && seedStatus && (
          <Card className="p-4 mb-6 bg-blue-500/10 border-blue-500/30">
            <div className="flex items-center gap-4">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <div className="flex-1">
                <p className="font-medium text-blue-400">🔄 Seeding in progress...</p>
                <p className="text-sm text-muted-foreground">
                  Processing video {seedStatus.seeded + 1} of {seedStatus.totalInList}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Add Video Section */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Single Video Ingest */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Add Single Video
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">YouTube URL</label>
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Title (optional)</label>
                <Input
                  placeholder="Video title"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => ingestVideo(videoUrl, videoTitle)}
                disabled={ingesting || !videoUrl.trim()}
              >
                {ingesting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Ingest Video
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Bulk Ingest */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              Bulk Import
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  YouTube URLs (one per line)
                </label>
                <Textarea
                  placeholder={`https://youtube.com/watch?v=abc123
https://youtube.com/watch?v=xyz456
https://youtu.be/def789`}
                  value={bulkUrls}
                  onChange={(e) => setBulkUrls(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={ingestBulk}
                disabled={ingesting || !bulkUrls.trim()}
              >
                {ingesting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Ingest All
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{videos.length}</p>
            <p className="text-sm text-muted-foreground">Total Videos</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-green-500">
              {videos.filter((v) => v.status === "done").length}
            </p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-yellow-500">
              {videos.filter((v) => v.status === "queued" || v.status === "processing").length}
            </p>
            <p className="text-sm text-muted-foreground">Processing</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-red-500">
              {videos.filter((v) => v.status === "failed").length}
            </p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </Card>
        </div>

        {/* Videos Table */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">All Videos</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No videos yet. Add your first video above!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Video ID</TableHead>
                    <TableHead>Chunks</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Transcript</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {videos.map((video) => (
                    <TableRow key={video._id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(video.status)}
                          <span className="capitalize text-xs">{video.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate font-medium text-sm">
                        {video.title || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {video.videoId?.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="text-center">{video.chunkCount || 0}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(video.ingestDate)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openTranscriptModal(video)}
                          title="View Transcript"
                        >
                          <Eye className="w-4 h-4 text-blue-400" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {video.url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={video.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteVideo(video.videoId)}
                            disabled={deleting === video.videoId}
                          >
                            {deleting === video.videoId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 text-red-500" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>

      {/* Transcript Modal */}
      <Dialog open={viewTranscript} onOpenChange={setViewTranscript}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {selectedVideo?.title || "Video Transcript"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {selectedVideo?.transcriptPreview && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                <p className="text-sm">{selectedVideo.transcriptPreview}</p>
              </div>
            )}
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {fullTranscript || "Loading transcript..."}
              </p>
            </div>
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {selectedVideo?.chunkCount || 0} chunks • {selectedVideo?.videoId}
            </p>
            {selectedVideo?.url && (
              <Button variant="outline" size="sm" asChild>
                <a href={selectedVideo.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Watch on YouTube
                </a>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
