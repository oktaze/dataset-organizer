import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useModelDownload } from "@/hooks/use-model-download";
import { useSettingsStore } from "@/stores/use-settings-store";

/** First-launch prompt: offer to download the WD Tagger model. Auto-opens
 *  once when the sidecar is ready and the model isn't present yet. */
export function ModelDownloadPrompt() {
  const { ready, downloadedOk, isDownloading, start } = useModelDownload();
  const seen = useSettingsStore((s) => s.modelPromptSeen);
  const setSeen = useSettingsStore((s) => s.setModelPromptSeen);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || seen) return;
    if (downloadedOk) {
      // Already downloaded (e.g. pre-fetched) — nothing to ask.
      setSeen(true);
    } else if (!isDownloading) {
      setOpen(true);
    }
  }, [ready, seen, downloadedOk, isDownloading, setSeen]);

  function dismiss() {
    setSeen(true);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download the auto-tagger model?</DialogTitle>
          <DialogDescription>
            LoRA Organizer uses the WD Tagger v3 model (~360 MB, one-time) to
            automatically tag imported images. You can download it now, or
            later from <strong>Settings</strong> (gear, top-left). Until then,
            importing won't auto-tag.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            Later
          </Button>
          <Button
            onClick={() => {
              start();
              dismiss();
            }}
          >
            <Download className="size-3.5" />
            Download now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
