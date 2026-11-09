import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Coins, ImagePlus, LoaderCircle, RefreshCw, Shirt, Sparkles } from "lucide-react";
import { useSession } from "../hooks/useSession";
import type { Route } from "../hooks/useRoute";
import { api, ApiRequestError } from "../lib/api";
import type { GenerationTask } from "../lib/generation/types";

interface Costume {
  id: string;
  cat: string;
  kw: string;
  thumb: string;
  img: string;
}

interface Me {
  balance: number;
  cost: number;
  pack: { credits: number; priceCents: number; projectId: string; enabled: boolean };
  available: boolean;
  needsVerification: boolean;
}

const CATS = ["春", "夏", "秋", "冬", "派对"];
const PICK_PAGE = 60;
const PACK_OPTIONS = [1, 3, 5, 10];
const GALLERY_URL = "https://ai-costume-zh.lwmlxy520.workers.dev/";
const active = (task: GenerationTask) => ["queued", "submitting", "running"].includes(task.status);
const STATUS: Record<GenerationTask["status"], string> = {
  queued: "排队中",
  submitting: "提交中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败（积分已退还）",
};
const ERRORS: Record<string, string> = {
  insufficient_credits: "积分不够了，请先充值。",
  tryon_daily_cap: "今天的试穿名额已用完，明天再来。",
  tryon_user_daily_cap: "你今天的试穿次数已达上限，明天再来。",
  tryon_unavailable: "试穿功能暂未开放。",
  costume_not_available: "这套衣服不支持试穿（内衣、性感、泳装分类不开放）。",
  photo_too_large: "照片不能超过 8MB。",
  photo_invalid: "请上传 JPG、PNG 或 WebP 格式的照片。",
  upload_failed: "照片上传失败，请重试。",
  rate_limited: "操作太频繁，请稍后再试。",
  email_unverified: "请先完成邮箱验证。",
  unauthenticated: "请先登录。",
  payments_disabled: "充值暂未开放。",
};
const errorText = (error: unknown) =>
  error instanceof ApiRequestError ? ERRORS[error.code] || "请求失败，请稍后重试。" : "网络异常，请稍后重试。";

// 浏览器端先把照片缩到长边 1536 以内，减少上传体积，也顺带去掉 EXIF
async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))), "image/jpeg", 0.9),
  );
}

function initialCostumeId(): string {
  const id = new URLSearchParams(window.location.search).get("costume") || "";
  return /^[A-Z]{3}-\d{4}$/.test(id) ? id : "";
}

export function TryOnPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const { user, isPending } = useSession();
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [costumeId, setCostumeId] = useState(initialCostumeId);
  const [picking, setPicking] = useState(false);
  const [cat, setCat] = useState("");
  const [shown, setShown] = useState(PICK_PAGE);
  const [me, setMe] = useState<Me | null>(null);
  const [photo, setPhoto] = useState<{ preview: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState(1);
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [message, setMessage] = useState("");
  const request = useRef<{ signature: string; key: string } | null>(null);
  const userId = user?.id;

  const costume = useMemo(() => costumes.find((c) => c.id === costumeId) || null, [costumes, costumeId]);
  const choices = useMemo(() => costumes.filter((c) => !cat || c.cat === cat), [costumes, cat]);

  useEffect(() => {
    api<{ costumes: Costume[] }>("/api/tryon/costumes")
      .then((data) => setCostumes(data.costumes))
      .catch(() => setMessage("服装列表加载失败，请刷新。"));
  }, []);

  useEffect(() => {
    if (costumes.length && costumeId && !costumes.some((c) => c.id === costumeId)) {
      setMessage(ERRORS.costume_not_available);
      setCostumeId("");
    }
  }, [costumes, costumeId]);

  const load = useCallback(async () => {
    if (!userId) return;
    const [mine, history] = await Promise.all([
      api<Me>("/api/tryon/me"),
      api<{ tasks: GenerationTask[] }>("/api/generation/tasks?limit=20&offset=0"),
    ]);
    setMe(mine);
    setTasks(history.tasks);
  }, [userId]);

  useEffect(() => {
    void load().catch(() => setMessage("账户信息加载失败，请刷新。"));
  }, [load]);

  const hasActive = tasks.some(active);
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 5_000);
    return () => window.clearInterval(timer);
  }, [hasActive, load]);

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setMessage("");
    setUploading(true);
    try {
      const blob = await shrinkPhoto(file);
      const form = new FormData();
      form.append("photo", blob, "photo.jpg");
      const response = await fetch("/api/tryon/photo", { method: "POST", body: form });
      const body = await response.json().catch(() => ({})) as { photoUrl?: string; code?: string; error?: string };
      if (!response.ok || !body.photoUrl) throw new ApiRequestError(response.status, body.code || "upload_failed", body.error || "");
      setPhoto({ preview: URL.createObjectURL(blob), url: body.photoUrl });
    } catch (error) {
      setPhoto(null);
      setMessage(error instanceof ApiRequestError ? errorText(error) : "无法读取这张照片，请换一张试试。");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!costume || !photo) return;
    const payload = { costumeId: costume.id, photoUrl: photo.url, consent: true };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ task: GenerationTask; balance: number }>("/api/tryon", {
        method: "POST",
        headers: { "idempotency-key": request.current.key },
        body: signature,
      });
      request.current = null;
      setTasks((current) => [result.task, ...current.filter((t) => t.id !== result.task.id)]);
      setMe((current) => (current ? { ...current, balance: result.balance } : current));
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    if (!me) return;
    setMessage("");
    try {
      const { checkoutUrl } = await api<{ checkoutUrl: string }>("/api/checkout", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ projectId: me.pack.projectId, quantity: packs }),
      });
      window.open(checkoutUrl, "_blank", "noopener");
      setMessage("已在新标签页打开收银台，付款完成后回到这里点“刷新”。");
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  const price = (cents: number) => "$" + (cents / 100).toFixed(2);
  const canSubmit = Boolean(user && me?.available && !me.needsVerification && costume && photo && consent && !busy && !uploading);

  return (
    <section className="generation-page tryon-page">
      <div className="page-heading">
        <p className="section-label">虚拟试穿</p>
        <h1>把衣装集里的衣服穿到你身上</h1>
        <p className="lede">
          上传一张你本人的照片，选一套衣服，AI 会生成你穿上这套衣服的样子。服装图片由
          <a href="https://x.com/giaaibusi" target="_blank" rel="noreferrer"> ギア（@giaaibusi）</a>
          制作，来自
          <a href={GALLERY_URL} target="_blank" rel="noreferrer">衣装集中文版</a>。
        </p>
      </div>

      <div className="generation-workspace">
        <div className="panel generation-composer tryon-composer">
          <div className="generation-panel-heading">
            <Shirt size={19} aria-hidden="true" />
            <h2>1. 选衣服</h2>
          </div>
          {costume ? (
            <div className="tryon-costume">
              <img src={costume.thumb} alt={costume.id} />
              <div>
                <strong>{costume.id}</strong>
                <span>{costume.cat}</span>
                <p>{costume.kw.split(" ").join(" · ")}</p>
                <button className="auth-secondary" type="button" onClick={() => setPicking((v) => !v)}>
                  {picking ? "收起" : "换一套"}
                </button>
              </div>
            </div>
          ) : (
            <p className="hint">还没选衣服。可以在下面挑，也可以在衣装集里点“试穿这套”跳过来。</p>
          )}
          {(picking || !costume) && (
            <div className="tryon-picker">
              <div className="tryon-cats">
                {["", ...CATS].map((c) => (
                  <button key={c || "all"} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setShown(PICK_PAGE); }}>
                    {c || "全部"}
                  </button>
                ))}
              </div>
              <div className="tryon-grid">
                {choices.slice(0, shown).map((c) => (
                  <button key={c.id} type="button" aria-pressed={c.id === costumeId} title={c.id} onClick={() => { setCostumeId(c.id); setPicking(false); }}>
                    <img src={c.thumb} alt={c.id} loading="lazy" />
                  </button>
                ))}
              </div>
              {shown < choices.length && (
                <button className="auth-secondary" type="button" onClick={() => setShown((n) => n + PICK_PAGE)}>
                  加载更多（还剩 {choices.length - shown} 套）
                </button>
              )}
            </div>
          )}

          <div className="generation-panel-heading">
            <ImagePlus size={19} aria-hidden="true" />
            <h2>2. 上传你的照片</h2>
          </div>
          <p className="hint">建议用正面、全身或半身、光线清楚的照片。照片只用于这次生成，24 小时内自动删除。</p>
          <label className="tryon-upload">
            {photo ? <img src={photo.preview} alt="你的照片" /> : <span>{uploading ? "上传中..." : "点击选择照片"}</span>}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!user || uploading || !me || me.needsVerification}
              onChange={(event) => void choosePhoto(event.target.files?.[0])}
            />
          </label>
          <label className="tryon-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            我确认照片是我本人、我已年满 18 岁，不会上传他人或未成年人的照片。
          </label>

          {!isPending && !user ? (
            <button className="auth-primary" type="button" onClick={() => onNavigate("/signin")}>登录后试穿</button>
          ) : (
            <button className="auth-primary" type="button" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {busy ? "提交中..." : `开始试穿（消耗 ${me?.cost ?? 1} 积分）`}
            </button>
          )}
          {user && me?.needsVerification && <p className="hint">请先到邮箱里完成验证，验证后会赠送试穿积分。</p>}
          {me && !me.available && <p className="generation-notice">试穿功能暂未开放。</p>}

          {me && (
            <div className="tryon-wallet">
              <div className="generation-panel-heading">
                <Coins size={19} aria-hidden="true" />
                <h2>积分余额：{me.balance}</h2>
              </div>
              {me.pack.enabled ? (
                <div className="tryon-buy">
                  <select value={packs} onChange={(event) => setPacks(Number(event.target.value))}>
                    {PACK_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n * me.pack.credits} 积分 · {price(n * me.pack.priceCents)}
                      </option>
                    ))}
                  </select>
                  <button className="auth-secondary" type="button" onClick={() => void buy()}>充值</button>
                </div>
              ) : (
                <p className="hint">充值暂未开放。</p>
              )}
            </div>
          )}
          {message && <p className="message" role="status">{message}</p>}
        </div>

        <div className="generation-history">
          <div className="generation-panel-heading">
            <h2>我的试穿</h2>
            <button className="auth-secondary" type="button" disabled={!user} onClick={() => void load().catch(() => setMessage("刷新失败，请稍后再试。"))}>
              <RefreshCw size={14} aria-hidden="true" />
              刷新
            </button>
          </div>
          <p className="hint">生成结果保留 14 天，请及时下载。生成失败会自动退还积分。</p>
          {!tasks.length && (
            <div className="panel generation-empty">
              <Sparkles size={28} aria-hidden="true" />
              <p>还没有试穿记录。</p>
            </div>
          )}
          <div className="generation-task-list">
            {tasks.map((task) => (
              <article className="panel generation-task" key={task.id}>
                <div className="generation-task-heading">
                  <span>{task.prompt}</span>
                  <span className="generation-status" data-status={task.status}>
                    {active(task) && <LoaderCircle className="spin" size={12} aria-hidden="true" />}
                    {STATUS[task.status]}
                  </span>
                </div>
                <time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleString("zh-CN")}</time>
                {!!task.outputs.length && (
                  <div className="generation-results">
                    {task.outputs.map((output, index) => (
                      <div key={index}>
                        <img src={output.url} alt={task.prompt} loading="lazy" />
                        <a href={output.url} target="_blank" rel="noreferrer">
                          查看原图
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
