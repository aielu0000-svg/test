import { useEffect, useRef, useState } from "react";

type Tool = "pen" | "frame" | "crop";
interface Point { x: number; y: number }

function point(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function loadDataUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    image.src = url;
  });
}

export function EvidenceImageEditor({ projectId, evidenceId, filename, onClose, onSaved }: {
  projectId: string;
  evidenceId: string;
  filename: string;
  onClose: () => void;
  onSaved: (run?: { id: string; version: number; postCompletionUpdatedAt?: string | null; postCompletionUpdatedBy?: string | null } | null) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef("");
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const startRef = useRef<Point | null>(null);
  const baseRef = useRef<ImageData | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#e1261c");
  const [lineWidth, setLineWidth] = useState(6);
  const [historyTick, setHistoryTick] = useState(0);
  const [message, setMessage] = useState("画像を読み込み中…");

  function snapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoRef.current.push(canvas.toDataURL("image/png"));
    if (undoRef.current.length > 30) undoRef.current.shift();
    redoRef.current = [];
    setHistoryTick((value) => value + 1);
  }

  async function restore(url: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = await loadDataUrl(url);
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
  }

  useEffect(() => {
    const url = `/api/evidence/${evidenceId}/download`;
    void loadDataUrl(url).then((image) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      originalRef.current = canvas.toDataURL("image/png");
      setMessage("");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "画像を読み込めませんでした。"));
  }, [evidenceId]);

  function rotate() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    snapshot();
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width = copy.height;
    canvas.height = copy.width;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(copy, 0, 0);
  }

  function flip(horizontal: boolean) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    snapshot();
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(horizontal ? canvas.width : 0, horizontal ? 0 : canvas.height);
    context.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
    context.drawImage(copy, 0, 0);
    context.restore();
  }

  async function undo() {
    const canvas = canvasRef.current;
    const previous = undoRef.current.pop();
    if (!canvas || !previous) return;
    redoRef.current.push(canvas.toDataURL("image/png"));
    await restore(previous);
    setHistoryTick((value) => value + 1);
  }

  async function redo() {
    const canvas = canvasRef.current;
    const next = redoRef.current.pop();
    if (!canvas || !next) return;
    undoRef.current.push(canvas.toDataURL("image/png"));
    await restore(next);
    setHistoryTick((value) => value + 1);
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    snapshot();
    startRef.current = point(event, canvas);
    baseRef.current = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height) ?? null;
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const start = startRef.current;
    if (!canvas || !start) return;
    const current = point(event, canvas);
    const context = canvas.getContext("2d");
    if (!context) return;
    if (tool === "pen") {
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(current.x, current.y);
      context.stroke();
      startRef.current = current;
      return;
    }
    if (baseRef.current) context.putImageData(baseRef.current, 0, 0);
    context.strokeStyle = tool === "crop" ? "#1668e3" : color;
    context.lineWidth = Math.max(2, lineWidth);
    context.setLineDash(tool === "crop" ? [12, 8] : []);
    context.strokeRect(start.x, start.y, current.x - start.x, current.y - start.y);
    context.setLineDash([]);
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const start = startRef.current;
    if (!canvas || !start) return;
    const current = point(event, canvas);
    if (tool === "crop") {
      if (baseRef.current) canvas.getContext("2d")?.putImageData(baseRef.current, 0, 0);
      const x = Math.max(0, Math.floor(Math.min(start.x, current.x)));
      const y = Math.max(0, Math.floor(Math.min(start.y, current.y)));
      const width = Math.min(canvas.width - x, Math.floor(Math.abs(current.x - start.x)));
      const height = Math.min(canvas.height - y, Math.floor(Math.abs(current.y - start.y)));
      if (width > 4 && height > 4) {
        const cropped = canvas.getContext("2d")?.getImageData(x, y, width, height);
        if (cropped) {
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d")?.putImageData(cropped, 0, 0);
        }
      }
    }
    startRef.current = null;
    baseRef.current = null;
  }

  async function pasteImage() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      const imageType = clipboardItems.flatMap((item) => item.types).find((type) => type.startsWith("image/"));
      const owner = clipboardItems.find((item) => imageType && item.types.includes(imageType));
      if (!owner || !imageType) throw new Error("クリップボードに画像がありません。");
      const blob = await owner.getType(imageType);
      const url = URL.createObjectURL(blob);
      const image = await loadDataUrl(url);
      URL.revokeObjectURL(url);
      const canvas = canvasRef.current;
      if (!canvas) return;
      snapshot();
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      setMessage("クリップボード画像を貼り付けました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "貼り付けに失敗しました。");
    }
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setMessage("新しい画像バージョンを保存中…");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return setMessage("画像を生成できませんでした。");
    const form = new FormData();
    form.append("file", blob, `${filename}.edited.png`);
    const response = await fetch(`/api/evidence/${evidenceId}/versions?projectId=${encodeURIComponent(projectId)}`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; run?: { id: string; version: number; postCompletionUpdatedAt?: string | null; postCompletionUpdatedBy?: string | null } | null };
    if (!response.ok) return setMessage(payload.error?.message ?? "保存に失敗しました。");
    setMessage("元画像を保持したまま、新しいバージョンを保存しました。");
    await onSaved(payload.run);
  }

  return <div className="image-editor-backdrop" role="dialog" aria-modal="true" aria-label="証跡画像編集">
    <div className="image-editor">
      <div className="section-heading"><div><h2>画像編集</h2><p className="muted">{filename}</p></div><button onClick={onClose}>閉じる</button></div>
      <div className="image-toolbar">
        <button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}>ペン</button>
        <button className={tool === "frame" ? "active" : ""} onClick={() => setTool("frame")}>枠線</button>
        <button className={tool === "crop" ? "active" : ""} onClick={() => setTool("crop")}>トリミング</button>
        <label>色<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label>太さ<input type="range" min="1" max="30" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} /></label>
        <button onClick={rotate}>90°回転</button><button onClick={() => flip(true)}>左右反転</button><button onClick={() => flip(false)}>上下反転</button>
        <button disabled={!undoRef.current.length} onClick={() => void undo()}>元に戻す</button>
        <button disabled={!redoRef.current.length} onClick={() => void redo()}>やり直す</button>
        <button onClick={() => { if (originalRef.current) { snapshot(); void restore(originalRef.current); } }}>元画像へ戻す</button>
        <button onClick={() => void pasteImage()}>画像を貼り付け</button>
        <span hidden>{historyTick}</span>
      </div>
      <div className="canvas-stage"><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} /></div>
      <div className="button-row"><button className="primary" onClick={() => void save()}>新しいバージョンとして保存</button></div>
      {message && <p className={message.includes("保存しました") ? "success-message" : "muted"}>{message}</p>}
    </div>
  </div>;
}
